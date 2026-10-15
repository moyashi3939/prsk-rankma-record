// app/api/rank/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// DBの行オブジェクトをキャメルケースに変換するヘルパー関数
function formatRankStatus(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    seasonId: row.season_id,
    rankName: row.rank_name,
    classIndex: row.class_index,
    grains: row.grains,
    placementMatchesPlayed: row.placement_matches_played,
    isPlacementCompleted: row.is_placement_completed,
    updatedAt: row.updated_at,
  };
}

// 現在のランク・シーズン状態を取得
export async function GET() {
  try {
    let result = await query('SELECT * FROM rank_status ORDER BY id DESC LIMIT 1');
    
    // まだレコードがなければ初期データを作成
    if (result.rows.length === 0) {
      const defaultInsert = await query(`
        INSERT INTO rank_status (season_id, rank_name, class_index, grains, placement_matches_played, is_placement_completed)
        VALUES ('Season 1', '判定マッチ', 0, 0, 0, FALSE)
        RETURNING *;
      `);
      result = defaultInsert;
    }

    return NextResponse.json(formatRankStatus(result.rows[0]));
  } catch (error) {
    console.error('ランク状態取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch rank status' }, { status: 500 });
  }
}

// ランク状態・シーズンの更新
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { seasonId, rankName, classIndex, grains, placementMatchesPlayed, isPlacementCompleted } = body;

    // 既存のステータスを更新（なければINSERT）
    const check = await query('SELECT id FROM rank_status LIMIT 1');
    
    let res;
    if (check.rows.length > 0) {
      res = await query(`
        UPDATE rank_status 
        SET season_id = COALESCE($1, season_id),
            rank_name = COALESCE($2, rank_name),
            class_index = COALESCE($3, class_index),
            grains = COALESCE($4, grains),
            placement_matches_played = COALESCE($5, placement_matches_played),
            is_placement_completed = COALESCE($6, is_placement_completed),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING *;
      `, [seasonId, rankName, classIndex, grains, placementMatchesPlayed, isPlacementCompleted, check.rows[0].id]);
    } else {
      res = await query(`
        INSERT INTO rank_status (season_id, rank_name, class_index, grains, placement_matches_played, is_placement_completed)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `, [seasonId || 'Season 1', rankName || '判定マッチ', classIndex || 0, grains || 0, placementMatchesPlayed || 0, isPlacementCompleted || false]);
    }

    return NextResponse.json({ success: true, rankStatus: formatRankStatus(res.rows[0]) });
  } catch (error) {
    console.error('ランク状態更新エラー:', error);
    return NextResponse.json({ error: 'Failed to update rank status' }, { status: 500 });
  }
}