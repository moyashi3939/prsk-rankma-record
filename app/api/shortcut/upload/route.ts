// app/api/shortcut/upload/route.ts
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureDifficultyColors, ensureShortcutTables, ensureSongJackets } from '@/lib/schema';
import { ownerFromBearer } from '@/lib/apiToken';
import { analyzeResultBuffer, isServerOcrAvailable } from '@/lib/serverOcr';
import { describeWeakest, type OcrResult } from '@/lib/ocrCore';
import { identifySong, type DifficultyColor, type SongRow } from '@/lib/songMatch';
import { recordMatchForOwner } from '@/lib/recordMatch';

const MAX_BYTES = 8 * 1024 * 1024; // 1枚あたり8MBまで
const MAX_PENDING = 30; // 受信箱（保留）に溜められる枚数（超えたら古いものから消す）
const KEEP_DAYS = 14; // 取り込まれないまま、この日数がたった画像は消す
const KEEP_HASH_DAYS = 30; // 処理済みの画像のハッシュを覚えておく日数

// ★ 自動で登録してよい信頼度（%）。これ未満のものは「保留」にして、アプリで確認してもらう
const AUTO_REGISTER_TRUST = 80;

// 画像の先頭のバイトで、JPEG / PNG / WebP か確認する（それ以外は受け付けない）
function sniffMime(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

const RESULT_JA: Record<string, string> = { WIN: '勝ち', LOSE: '負け', DRAW: '引き分け', 'WIN (AP DRAW)': '引き分け（両者AP）' };

const isNum = (v: number | null): v is number => typeof v === 'number';

// 自動で登録してよいか、判断する。自信がなければ、保留にする理由（reasons）を返す
function judgeAutoRegister(ocr: OcrResult, identify: ReturnType<typeof identifySong>) {
  const reasons: string[] = [];

  const m = ocr.me;
  const o = ocr.opponent;
  const allRead =
    [m.perfect, m.great, m.good, m.bad, m.miss].every(isNum) && [o.perfect, o.great, o.good, o.bad, o.miss].every(isNum);
  if (!allRead) reasons.push('読み取れなかった数字があります');

  if (ocr.trust < AUTO_REGISTER_TRUST) {
    reasons.push(`読み取りに自信がありません（${describeWeakest(ocr.weakest)}・信頼度 ${Math.round(ocr.trust)}%）`);
  }

  if (!identify.chart) {
    reasons.push('曲を決められませんでした');
  } else if (identify.confidence !== 'high') {
    reasons.push('曲・難易度に確信が持てませんでした');
  }
  reasons.push(...identify.reasons);

  // 自動で登録してよいのは、次のすべてを満たすときだけ
  //  ・数字がすべて読めている（推定で埋めたものがない）
  //  ・読み取りの信頼度が AUTO_REGISTER_TRUST 以上で、自分と相手の判定の合計も合っている
  //  ・曲と難易度が、ジャケットと総ノーツ数から1つに決まり、確信度が high
  const ok = allRead && ocr.trust >= AUTO_REGISTER_TRUST && !!identify.chart && identify.confidence === 'high';

  return { ok, reasons };
}

// iOSショートカットからリザルト画像を送る
//   POST /api/shortcut/upload
//   ヘッダ:  Authorization: Bearer <トークン>
//   本文:    フォーム（フィールド名 image のファイル）、または画像そのもの
//
// 送られた画像は、サーバーで読み取る。
//   ・確信が持てるもの … そのまま登録する（許可は不要）
//   ・自信が低いもの   … 「受信箱（保留）」に入れて、アプリで確認してもらう
//   ・同じ画像をもう一度送ったとき … 何もしない（二重登録の防止）
export async function POST(request: Request) {
  try {
    const owner = await ownerFromBearer(request);
    if (!owner) {
      return NextResponse.json({ error: 'トークンが正しくありません' }, { status: 401 });
    }

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BYTES + 1024 * 64) {
      return NextResponse.json({ error: '画像が大きすぎます（8MBまで）' }, { status: 413 });
    }

    let buf: Buffer;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.startsWith('multipart/form-data')) {
      const form = await request.formData();
      let file: unknown = form.get('image');
      if (!(file instanceof File)) {
        // フィールド名が違っていても、最初に見つかったファイルを使う
        file = Array.from(form.values()).find((v) => v instanceof File);
      }
      if (!(file instanceof File)) {
        return NextResponse.json({ error: '画像が見つかりません（フィールド名は image にしてください）' }, { status: 400 });
      }
      buf = Buffer.from(await file.arrayBuffer());
    } else {
      buf = Buffer.from(await request.arrayBuffer());
    }

    if (buf.length === 0) {
      return NextResponse.json({ error: '画像が空です' }, { status: 400 });
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: '画像が大きすぎます（8MBまで）' }, { status: 413 });
    }

    const mime = sniffMime(buf);
    if (!mime) {
      return NextResponse.json(
        { error: 'JPEG / PNG / WebP の画像だけ送れます（HEICの場合は、ショートカットで「イメージを変換」を使ってください）' },
        { status: 415 }
      );
    }

    await ensureShortcutTables();

    // 古いものを整理
    await query(`DELETE FROM shortcut_uploads WHERE owner_id = $1 AND created_at < NOW() - ($2 || ' days')::interval`, [
      owner,
      String(KEEP_DAYS),
    ]);
    await query(`DELETE FROM shortcut_processed WHERE owner_id = $1 AND created_at < NOW() - ($2 || ' days')::interval`, [
      owner,
      String(KEEP_HASH_DAYS),
    ]);

    // ---- 同じ画像を、もう送っていないか ----
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const dup = await query(
      `SELECT 1 FROM shortcut_processed WHERE owner_id = $1 AND sha256 = $2
       UNION ALL
       SELECT 1 FROM shortcut_uploads WHERE owner_id = $1 AND sha256 = $2
       LIMIT 1`,
      [owner, sha256]
    );
    if (dup.rows.length > 0) {
      return NextResponse.json({
        success: true,
        status: 'duplicate',
        message: 'ℹ️ この画像は、すでに送信済みです（二重には登録しません）',
      });
    }

    // ---- サーバーで読み取る ----
    let ocr: OcrResult | null = null;
    let identify: ReturnType<typeof identifySong> | null = null;
    let pendingReasons: string[] = [];

    if (await isServerOcrAvailable()) {
      try {
        ocr = await analyzeResultBuffer(buf);
      } catch (err) {
        console.error('サーバーでの画像読み取りエラー:', err);
        pendingReasons.push('画像の読み取りに失敗しました');
      }
    } else {
      pendingReasons.push('サーバーでの自動読み取りが使えないため、アプリで確認してください');
    }

    if (ocr) {
      // 曲・ジャケット・難易度の色のデータを読み込む
      await ensureSongJackets();
      await ensureDifficultyColors();
      const [songsRes, jacketsRes, colorsRes] = await Promise.all([
        query('SELECT id, song_name, difficulty, level, total_notes FROM songs'),
        query('SELECT song_name, hex FROM song_jackets'),
        query('SELECT difficulty, r, g, b FROM difficulty_colors'),
      ]);

      const m = ocr.me;
      const mine = [m.perfect, m.great, m.good, m.bad, m.miss];
      const total = mine.every(isNum) ? (mine as number[]).reduce((a, b) => a + b, 0) : null;

      identify = identifySong({
        total,
        jacketHex: ocr.jacket?.hex ?? null,
        ring: ocr.jacket?.ring ?? null,
        songs: songsRes.rows as SongRow[],
        jackets: jacketsRes.rows.map((r) => ({ songName: r.song_name, hex: r.hex })),
        difficultyColors: colorsRes.rows as DifficultyColor[],
      });

      const judged = judgeAutoRegister(ocr, identify);

      if (judged.ok && identify.chart) {
        // ---- 確信が持てる → そのまま登録する ----
        const o = ocr.opponent;
        const chart = identify.chart;
        const saved = await recordMatchForOwner(owner, {
          songName: chart.song_name,
          difficulty: chart.difficulty,
          level: String(chart.level),
          totalNotes: Number(chart.total_notes),
          my: { perfect: m.perfect as number, great: m.great as number, good: m.good as number, bad: m.bad as number, miss: m.miss as number },
          opp: { great: o.great as number, good: o.good as number, bad: o.bad as number, miss: o.miss as number },
        });

        await query('INSERT INTO shortcut_processed (owner_id, sha256) VALUES ($1, $2) ON CONFLICT DO NOTHING', [owner, sha256]);

        return NextResponse.json({
          success: true,
          status: 'registered',
          message: `✅ 登録しました：${chart.song_name}（${chart.difficulty}）${RESULT_JA[saved.actualResult] ?? saved.actualResult}／${saved.rankText}`,
          song: chart.song_name,
          difficulty: chart.difficulty,
          result: saved.actualResult,
          rank: saved.rankText,
        });
      }

      pendingReasons = judged.reasons;
    }

    // ---- 自信が低い → 受信箱（保留）に入れる ----
    const reason = pendingReasons.join(' / ') || '内容の確認が必要です';
    const inserted = await query(
      'INSERT INTO shortcut_uploads (owner_id, mime, image, size, sha256, reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [owner, mime, buf, buf.length, sha256, reason]
    );

    // 溜まりすぎたら、古いものから消す
    await query(
      `DELETE FROM shortcut_uploads
       WHERE owner_id = $1
         AND id NOT IN (SELECT id FROM shortcut_uploads WHERE owner_id = $1 ORDER BY id DESC LIMIT $2)`,
      [owner, MAX_PENDING]
    );

    const count = await query('SELECT COUNT(*)::int AS n FROM shortcut_uploads WHERE owner_id = $1', [owner]);
    return NextResponse.json({
      success: true,
      status: 'pending',
      message: `📥 確認待ちにしました（アプリで確認してください）：${reason}`,
      id: inserted.rows[0].id,
      reason,
      pending: count.rows[0].n,
    });
  } catch (error) {
    console.error('ショートカットからの画像受信エラー:', error);
    return NextResponse.json({ error: 'Failed to receive image' }, { status: 500 });
  }
}
