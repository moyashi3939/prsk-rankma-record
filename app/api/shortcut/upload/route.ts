// app/api/shortcut/upload/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureShortcutTables } from '@/lib/schema';
import { ownerFromBearer } from '@/lib/apiToken';

const MAX_BYTES = 8 * 1024 * 1024; // 1枚あたり8MBまで
const MAX_PENDING = 30; // 受信箱に溜められる枚数（超えたら古いものから消す）
const KEEP_DAYS = 14; // 取り込まれないまま、この日数がたった画像は消す

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

// iOSショートカットからリザルト画像を送る
//   POST /api/shortcut/upload
//   ヘッダ:  Authorization: Bearer <トークン>
//   本文:    フォーム（フィールド名 image のファイル）、または画像そのもの
// 送った画像は「受信箱」に入り、アプリの記録画面で取り込んで、1枚ずつ確認しながら登録する
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

    // 古い画像を整理
    await query(`DELETE FROM shortcut_uploads WHERE owner_id = $1 AND created_at < NOW() - ($2 || ' days')::interval`, [
      owner,
      String(KEEP_DAYS),
    ]);

    const inserted = await query(
      'INSERT INTO shortcut_uploads (owner_id, mime, image, size) VALUES ($1, $2, $3, $4) RETURNING id',
      [owner, mime, buf, buf.length]
    );

    // 溜まりすぎたら、古いものから消す
    await query(
      `DELETE FROM shortcut_uploads
       WHERE owner_id = $1
         AND id NOT IN (SELECT id FROM shortcut_uploads WHERE owner_id = $1 ORDER BY id DESC LIMIT $2)`,
      [owner, MAX_PENDING]
    );

    const count = await query('SELECT COUNT(*)::int AS n FROM shortcut_uploads WHERE owner_id = $1', [owner]);
    return NextResponse.json({ success: true, id: inserted.rows[0].id, pending: count.rows[0].n });
  } catch (error) {
    console.error('ショートカットからの画像受信エラー:', error);
    return NextResponse.json({ error: 'Failed to receive image' }, { status: 500 });
  }
}
