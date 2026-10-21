// app/api/rank/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureOwnerColumns, getDefaultSeason } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';
import { formatRankStatus } from '@/lib/rank';

// 自分の現在のランク状態を取得
export async function GET() {
  try {
    await ensureOwnerColumns();
    const owner = await getOwnerId();

    let result = await query(
      'SELECT * FROM rank_status WHERE owner_id = $1 ORDER BY id DESC LIMIT 1',
      [owner]
    );

    // まだ自分のレコードがなければ初期データを作成
    if (result.rows.length === 0) {
      await query(
        `INSERT INTO rank_status (owner_id, season_id, rank_name, class_index, grains, placement_matches_played, is_placement_completed)
         VALUES ($1, $2, '判定マッチ', 0, 0, 0, FALSE)
         ON CONFLICT (owner_id) DO NOTHING`,
        [owner, await getDefaultSeason()]
      );
      result = await query('SELECT * FROM rank_status WHERE owner_id = $1 ORDER BY id DESC LIMIT 1', [owner]);
    }

    return NextResponse.json(formatRankStatus(result.rows[0]));
  } catch (error) {
    console.error('ランク状態取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch rank status' }, { status: 500 });
  }
}

// 自分のランク状態の更新
//  placementRankName / placementClassIndex … 判定マッチのあとに選んだランク（対戦履歴の削除時に使うので覚えておく）
export async function POST(request: Request) {
  try {
    await ensureOwnerColumns();
    const owner = await getOwnerId();

    const body = await request.json();
    const {
      seasonId,
      rankName,
      classIndex,
      grains,
      placementMatchesPlayed,
      isPlacementCompleted,
      placementRankName,
      placementClassIndex,
    } = body;

    // まず更新を試し、自分のレコードがなければ INSERT
    let res = await query(
      `UPDATE rank_status 
       SET season_id = COALESCE($1, season_id),
           rank_name = COALESCE($2, rank_name),
           class_index = COALESCE($3, class_index),
           grains = COALESCE($4, grains),
           placement_matches_played = COALESCE($5, placement_matches_played),
           is_placement_completed = COALESCE($6, is_placement_completed),
           placement_rank_name = COALESCE($8, placement_rank_name),
           placement_class_index = COALESCE($9, placement_class_index),
           updated_at = CURRENT_TIMESTAMP
       WHERE owner_id = $7
       RETURNING *;`,
      [
        seasonId,
        rankName,
        classIndex,
        grains,
        placementMatchesPlayed,
        isPlacementCompleted,
        owner,
        placementRankName ?? null,
        placementClassIndex ?? null,
      ]
    );

    if (res.rows.length === 0) {
      res = await query(
        `INSERT INTO rank_status (owner_id, season_id, rank_name, class_index, grains, placement_matches_played, is_placement_completed, placement_rank_name, placement_class_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *;`,
        [
          owner,
          seasonId || (await getDefaultSeason()),
          rankName || '判定マッチ',
          classIndex || 0,
          grains || 0,
          placementMatchesPlayed || 0,
          isPlacementCompleted || false,
          placementRankName ?? null,
          placementClassIndex ?? null,
        ]
      );
    }

    return NextResponse.json({ success: true, rankStatus: formatRankStatus(res.rows[0]) });
  } catch (error) {
    console.error('ランク状態更新エラー:', error);
    return NextResponse.json({ error: 'Failed to update rank status' }, { status: 500 });
  }
}
