// app/api/matches/route.ts
import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { ensureOwnerColumns } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';
import { baselineFromRow, formatRankStatus, replay, revertLegacy, stateFromRow } from '@/lib/rank';

// 対戦レコードの保存
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      songName,
      difficulty,
      level,
      isOpponentHigher,
      myPerf,
      myGreat,
      myGood,
      myBad,
      myMiss,
      oppPerf,
      oppGreat,
      oppGood,
      oppBad,
      oppMiss,
      myScore,
      oppScore,
      result,
    } = body;

    if (!result) {
      return NextResponse.json({ error: 'result is required' }, { status: 400 });
    }

    await ensureOwnerColumns();
    const owner = await getOwnerId();

    const queryText = `
      INSERT INTO matches (
        song_name, difficulty, level, is_opponent_higher,
        my_perf, my_great, my_good, my_bad, my_miss,
        opp_perf, opp_great, opp_good, opp_bad, opp_miss,
        my_score, opp_score, result, owner_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *;
    `;

    const values = [
      songName,
      difficulty,
      level,
      isOpponentHigher || false,
      parseInt(myPerf) || 0,
      parseInt(myGreat) || 0,
      parseInt(myGood) || 0,
      parseInt(myBad) || 0,
      parseInt(myMiss) || 0,
      parseInt(oppPerf) || 0,
      parseInt(oppGreat) || 0,
      parseInt(oppGood) || 0,
      parseInt(oppBad) || 0,
      parseInt(oppMiss) || 0,
      parseInt(myScore) || 0,
      parseInt(oppScore) || 0,
      result,
      owner,
    ];

    const res = await query(queryText, values);
    return NextResponse.json({ success: true, match: res.rows[0] });
  } catch (error) {
    console.error('対戦レコード保存エラー:', error);
    return NextResponse.json({ error: 'Failed to save match' }, { status: 500 });
  }
}

// 自分の対戦レコードの削除（ランク・粒も正しい状態に直す）
// ・「最初の状態」が分かっているデータ … 最初の状態から、残りの対戦を順に当てはめ直して現在の状態を求める（正確）
// ・古いデータ（最初の状態が不明） … 削除した試合ぶんを、現在の状態から1つ戻す（近似）
export async function DELETE(request: Request) {
  const client = await getClient();
  try {
    await ensureOwnerColumns();
    const owner = await getOwnerId();

    const { recordId } = await request.json();
    const id = Number(recordId);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Record ID is required' }, { status: 400 });
    }

    await client.query('BEGIN');

    // 1. 自分のレコードだけを削除対象にする（他人の記録は消せない）
    const deleted = await client.query(
      'DELETE FROM matches WHERE id = $1 AND owner_id = $2 RETURNING result',
      [id, owner]
    );
    if (deleted.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    const deletedResult: string = deleted.rows[0].result ?? '';

    // 2. 自分のランク状態を、削除後の対戦履歴に合わせて直す
    let rankStatus = null;
    const rankRes = await client.query('SELECT * FROM rank_status WHERE owner_id = $1 FOR UPDATE', [owner]);

    if (rankRes.rows.length > 0) {
      const row = rankRes.rows[0];
      const remaining = await client.query('SELECT result FROM matches WHERE owner_id = $1 ORDER BY id ASC', [owner]);
      const results: string[] = remaining.rows.map((r) => r.result ?? '');

      const next = row.baseline_known
        ? replay(baselineFromRow(row), results)
        : revertLegacy(stateFromRow(row), deletedResult, results.length);

      const updated = await client.query(
        `UPDATE rank_status
         SET rank_name = $1, class_index = $2, grains = $3,
             placement_matches_played = $4, is_placement_completed = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [next.rankName, next.classIndex, next.grains, next.placementMatchesPlayed, next.isPlacementCompleted, row.id]
      );
      rankStatus = formatRankStatus(updated.rows[0]);
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, rankStatus });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('レコード削除エラー:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    client.release();
  }
}
