// app/api/admin/jackets/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureSongJackets } from '@/lib/schema';
import { requireAdmin } from '@/lib/admin';
import { expectedJacketVariants } from '@/lib/jacketVariants';

// 管理者画面用：全曲の一覧と、ジャケットの登録状況（サムネイル・譜面の情報付き）
// 1つの曲に、ジャケットが複数あることがある（バージョンで変わる曲）。登録済みの数と、あるはずの数も返す。
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    await ensureSongJackets();
    const res = await query(
      `SELECT s.song_name, s.charts,
              COALESCE(
                (SELECT json_agg(json_build_object('id', j.id, 'thumb', j.thumb) ORDER BY j.id)
                 FROM song_jackets j WHERE j.song_name = s.song_name),
                '[]'::json
              ) AS jackets
       FROM (
         SELECT song_name,
                json_agg(json_build_object('difficulty', difficulty, 'level', level, 'totalNotes', total_notes)
                         ORDER BY total_notes) AS charts
         FROM songs
         GROUP BY song_name
       ) s
       ORDER BY s.song_name`
    );
    return NextResponse.json(
      res.rows.map((r) => ({
        songName: r.song_name,
        charts: r.charts || [],
        jackets: r.jackets || [], // [{ id, thumb }]
        expected: expectedJacketVariants(r.song_name), // ジャケットが何種類あるはずか
      }))
    );
  } catch (error) {
    console.error('ジャケット管理一覧取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch jackets' }, { status: 500 });
  }
}
