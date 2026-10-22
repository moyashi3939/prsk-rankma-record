// app/api/rank/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureOwnerColumns } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';

// DBの行オブジェクトをフロントエンド用に変換するヘルパー関数
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

// 新規ユーザーの初期シーズン（開催中のシーズンがあればそれ、なければ Season 1）
async function defaultSeason(): Promise<string> {
  try {
    const res = await query('SELECT season_name FROM seasons WHERE is_current = TRUE LIMIT 1');
    return res.rows[0]?.season_name || 'Season 1';
  } catch {
    return 'Season 1';
  }
}

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
        [owner, await defaultSeason()]
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
export async function POST(request: Request) {
  try {
    await ensureOwnerColumns();
    const owner = await getOwnerId();

    const body = await request.json();
    const { seasonId, rankName, classIndex, grains, placementMatchesPlayed, isPlacementCompleted } = body;

    // まず更新を試し、自分のレコードがなければ INSERT
    let res = await query(
      `UPDATE rank_status 
       SET season_id = COALESCE($1, season_id),
           rank_name = COALESCE($2, rank_name),
           class_index = COALESCE($3, class_index),
           grains = COALESCE($4, grains),
           placement_matches_played = COALESCE($5, placement_matches_played),
           is_placement_completed = COALESCE($6, is_placement_completed),
           updated_at = CURRENT_TIMESTAMP
       WHERE owner_id = $7
       RETURNING *;`,
      [seasonId, rankName, classIndex, grains, placementMatchesPlayed, isPlacementCompleted, owner]
    );

    if (res.rows.length === 0) {
      res = await query(
        `INSERT INTO rank_status (owner_id, season_id, rank_name, class_index, grains, placement_matches_played, is_placement_completed)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *;`,
        [
          owner,
          seasonId || (await defaultSeason()),
          rankName || '判定マッチ',
          classIndex || 0,
          grains || 0,
          placementMatchesPlayed || 0,
          isPlacementCompleted || false,
        ]
      );
    }

    return NextResponse.json({ success: true, rankStatus: formatRankStatus(res.rows[0]) });
  } catch (error) {
    console.error('ランク状態更新エラー:', error);
    return NextResponse.json({ error: 'Failed to update rank status' }, { status: 500 });
  }
}