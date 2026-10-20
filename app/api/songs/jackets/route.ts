// app/api/songs/jackets/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureSongJackets } from '@/lib/schema';
import { getSessionEmail } from '@/lib/session';
import { isAdminEmail, requireAdmin } from '@/lib/admin';

// 4x4マス = 96文字 / 8x8マス = 384文字（RGB × 2桁 × マス数）。8x8で保存済みのものも受け付ける
const HEX_PATTERN = /^([0-9a-f]{96}|[0-9a-f]{384})$/;
const THUMB_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const THUMB_MAX_LENGTH = 30000;

// 保存済みのジャケット一覧（記録画面で、読み取ったジャケットと見比べるのに使う）
// ※サムネイルは重いので含めない（管理者画面は /api/admin/jackets から取得する）
export async function GET() {
  try {
    await ensureSongJackets();
    const res = await query('SELECT song_name, hex FROM song_jackets');
    return NextResponse.json(res.rows.map((r) => ({ songName: r.song_name, hex: r.hex })));
  } catch (error) {
    console.error('ジャケット一覧取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch jackets' }, { status: 500 });
  }
}

// ジャケットの登録（記録画面で曲を確定したときに、まだジャケットのない曲へ自動で登録される）
// ・登録済みの曲は上書きしない（最初に登録されたものを残す）
// ・管理者だけ、overwrite: true で上書きできる
export async function POST(request: Request) {
  try {
    const { songName, hex, thumb, overwrite } = await request.json();
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
    if (overwrite && isAdmin) {
      await query(
        `INSERT INTO song_jackets (song_name, hex, thumb) VALUES ($1, $2, $3)
         ON CONFLICT (song_name) DO UPDATE SET hex = $2, thumb = $3, updated_at = CURRENT_TIMESTAMP`,
        [songName, hex, thumbValue]
      );
      return NextResponse.json({ success: true, saved: true });
    }

    const res = await query(
      `INSERT INTO song_jackets (song_name, hex, thumb) VALUES ($1, $2, $3)
       ON CONFLICT (song_name) DO NOTHING`,
      [songName, hex, thumbValue]
    );
    return NextResponse.json({ success: true, saved: (res.rowCount ?? 0) > 0 });
  } catch (error) {
    console.error('ジャケット登録エラー:', error);
    return NextResponse.json({ error: 'Failed to save jacket' }, { status: 500 });
  }
}

// ジャケットの削除（管理者のみ。間違って登録されたジャケットを消すのに使う）
//   例: DELETE /api/songs/jackets?name=曲名
export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const name = new URL(request.url).searchParams.get('name');
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    await ensureSongJackets();
    await query('DELETE FROM song_jackets WHERE song_name = $1', [name]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ジャケット削除エラー:', error);
    return NextResponse.json({ error: 'Failed to delete jacket' }, { status: 500 });
  }
}
