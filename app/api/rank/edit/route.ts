// app/api/rank/edit/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureOwnerColumns, getDefaultSeason } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';
import { formatRankStatus, validateStart, PLACEMENT_MATCHES } from '@/lib/rank';

// ランク・クラス・粒・ボーナスを、手で修正する（読み取りや計算がずれたときに、直せるように）
//   { rankName, classIndex, grains, bonus }
//
// 修正した状態を、新しい「最初の状態」として覚える。
// 修正より前の対戦は、履歴には残るが、ランクの計算には使わなくなる
// （あとで、修正より前の対戦を削除しても、ランクが変わらない）。
// 修正のあとに記録した対戦だけが、ここから積み上がる。
export async function POST(request: Request) {
  try {
    await ensureOwnerColumns();
    const owner = await getOwnerId();
    const body = await request.json();

    const checked = validateStart(body);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    const v = checked.value;

    // いま記録されている、いちばん新しい対戦（これより古い対戦は、ランクの計算に使わなくなる）
    const latest = await query('SELECT COALESCE(MAX(id), 0)::int AS id FROM matches WHERE owner_id = $1', [owner]);
    const afterId: number = latest.rows[0].id;

    const res = await query(
      `INSERT INTO rank_status (
         owner_id, season_id, rank_name, class_index, grains, bonus, placement_matches_played, is_placement_completed,
         setup_done, baseline_known, start_rank_name, start_class_index, start_grains, start_bonus,
         placement_rank_name, placement_class_index, baseline_after_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE, TRUE, $3, $4, $5, $6, NULL, NULL, $8)
       ON CONFLICT (owner_id) DO UPDATE SET
         rank_name = $3,
         class_index = $4,
         grains = $5,
         bonus = $6,
         placement_matches_played = $7,
         is_placement_completed = TRUE,
         setup_done = TRUE,
         baseline_known = TRUE,
         start_rank_name = $3,
         start_class_index = $4,
         start_grains = $5,
         start_bonus = $6,
         placement_rank_name = NULL,
         placement_class_index = NULL,
         baseline_after_id = $8,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [owner, await getDefaultSeason(), v.rankName, v.classIndex, v.grains, v.bonus, PLACEMENT_MATCHES, afterId]
    );

    return NextResponse.json({ success: true, rankStatus: formatRankStatus(res.rows[0]) });
  } catch (error) {
    console.error('ランクの修正エラー:', error);
    return NextResponse.json({ error: 'Failed to edit rank' }, { status: 500 });
  }
}
