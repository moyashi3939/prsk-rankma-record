// app/api/songs/jackets/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureSongJackets } from '@/lib/schema';
import { getSessionEmail } from '@/lib/session';
import { isAdminEmail, requireAdmin } from '@/lib/admin';
import { jacketDistance, JACKET_SAME_THRESHOLD, normalizeJacketHex } from '@/lib/ocrCore';
import { MAX_JACKET_VARIANTS, MAX_JACKET_VARIANTS_ADMIN } from '@/lib/jacketVariants';

// 4x4マス = 96文字 / 8x8マス = 384文字（RGB × 2桁 × マス数）。8x8で保存済みのものも受け付ける
const HEX_PATTERN = /^([0-9a-f]{96}|[0-9a-f]{384})$/;
const THUMB_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const THUMB_MAX_LENGTH = 30000;

// 保存済みのジャケット一覧（記録画面で、読み取ったジャケットと見比べるのに使う）
// ※1つの曲に、ジャケットが複数あることがある（バージョンで変わる曲）。
// ※サムネイルは重いので含めない（管理者画面は /api/admin/jackets から取得する）
export async function GET() {
  try {
    await ensureSongJackets();
    const res = await query('SELECT id, song_name, hex FROM song_jackets ORDER BY id');
    return NextResponse.json(res.rows.map((r) => ({ id: r.id, songName: r.song_name, hex: r.hex })));
  } catch (error) {
    console.error('ジャケット一覧取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch jackets' }, { status: 500 });
  }
}

// ジャケットの登録
//  ・記録画面で曲を確定したときに、その曲の「まだ登録されていない種類」のジャケットが、自動で追加される
//  ・すでに同じジャケットが登録されているときは、何もしない（管理者だけ、最新の画像で置き換える）
//  ・1つの曲に登録できる数には、上限がある（ユーザーの自動登録: MAX_JACKET_VARIANTS / 管理者: MAX_JACKET_VARIANTS_ADMIN）
//  ・管理者だけ、replaceId を付けて、登録済みの1つを置き換えられる
export async function POST(request: Request) {
  try {
    const { songName, hex, thumb, replaceId } = await request.json();
    if (typeof songName !== 'string' || !songName || typeof hex !== 'string' || !HEX_PATTERN.test(hex)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (thumb !== undefined && thumb !== null) {
      if (typeof thumb !== 'string' || thumb.length > THUMB_MAX_LENGTH || !THUMB_PATTERN.test(thumb)) {
        return NextResponse.json({ error: 'Invalid thumbnail' }, { status: 400 });
      }
    }
    const thumbValue: string | null = typeof thumb === 'string' ? thumb : null;

    await ensureSongJackets();

    // 曲として登録済みの名前だけ受け付ける
    const exists = await query('SELECT 1 FROM songs WHERE song_name = $1 LIMIT 1', [songName]);
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const isAdmin = isAdminEmail(await getSessionEmail());

    // この曲に、すでに登録されているジャケット
    const existing = await query('SELECT id, hex FROM song_jackets WHERE song_name = $1', [songName]);

    // 管理者が、登録済みの1つを指定して置き換える
    if (isAdmin && Number.isInteger(replaceId)) {
      const res = await query(
        'UPDATE song_jackets SET hex = $1, thumb = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND song_name = $4',
        [hex, thumbValue, replaceId, songName]
      );
      return NextResponse.json({ success: true, saved: (res.rowCount ?? 0) > 0, replaced: true });
    }

    // すでに同じジャケット（近いもの）があるか
    const target = normalizeJacketHex(hex);
    let nearest: { id: number; distance: number } | null = null;
    for (const row of existing.rows) {
      const h = normalizeJacketHex(row.hex);
      if (!target || !h) continue;
      const distance = jacketDistance(target, h);
      if (!nearest || distance < nearest.distance) nearest = { id: row.id, distance };
    }

    if (nearest && nearest.distance <= JACKET_SAME_THRESHOLD) {
      if (isAdmin) {
        // 管理者は、同じジャケットなら、最新の画像（とサムネイル）で置き換える
        await query('UPDATE song_jackets SET hex = $1, thumb = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [
          hex,
          thumbValue,
          nearest.id,
        ]);
        return NextResponse.json({ success: true, saved: true, replaced: true });
      }
      return NextResponse.json({ success: true, saved: false, reason: 'same' });
    }

    // 別のジャケット（別のバージョン）として追加する。上限があるので、超えたら追加しない
    const limit = isAdmin ? MAX_JACKET_VARIANTS_ADMIN : MAX_JACKET_VARIANTS;
    if (existing.rows.length >= limit) {
      return NextResponse.json({ success: true, saved: false, reason: 'limit' });
    }

    const inserted = await query('INSERT INTO song_jackets (song_name, hex, thumb) VALUES ($1, $2, $3) RETURNING id', [
      songName,
      hex,
      thumbValue,
    ]);
    return NextResponse.json({ success: true, saved: true, id: inserted.rows[0].id });
  } catch (error) {
    console.error('ジャケット登録エラー:', error);
    return NextResponse.json({ error: 'Failed to save jacket' }, { status: 500 });
  }
}

// ジャケットの削除（管理者のみ。間違って登録されたジャケットを消すのに使う）
//   DELETE /api/songs/jackets?id=番号     … その1つだけを消す
//   DELETE /api/songs/jackets?name=曲名   … その曲のジャケットを、すべて消す
export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    const name = params.get('name');
    await ensureSongJackets();

    if (id !== null) {
      const n = Number(id);
      if (!Number.isInteger(n)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
      await query('DELETE FROM song_jackets WHERE id = $1', [n]);
      return NextResponse.json({ success: true });
    }
    if (name) {
      await query('DELETE FROM song_jackets WHERE song_name = $1', [name]);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'id or name is required' }, { status: 400 });
  } catch (error) {
    console.error('ジャケット削除エラー:', error);
    return NextResponse.json({ error: 'Failed to delete jacket' }, { status: 500 });
  }
}
