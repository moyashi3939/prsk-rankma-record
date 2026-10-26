// app/api/matches/route.ts
import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { ensureOwnerColumns } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';
import { actualResultOf } from '@/lib/matchCalc'; // 追加

// 対戦レコードの保存
export async function POST(request: Request) {
  const client = await getClient(); // トランザクション用にclientを取得
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
      isBothAP, // フロントエンドから渡される想定（またはここで判定）
    } = body;

    if (!result) {
      return NextResponse.json({ error: 'result is required' }, { status: 400 });
    }

    await ensureOwnerColumns();
    const owner = await getOwnerId();

    // 引き分け＋両者APの場合の勝ち扱いを反映
    const finalResult = actualResultOf(result, isBothAP || false);

    await client.query('BEGIN');

    // 1. 対戦レコードの挿入
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
      finalResult, // 補正後の結果を保存
      owner,
    ];

    const res = await client.query(queryText, values);

    // 2. 勝敗から粒の増減を計算（WIN 系は +1、LOSE は -1、DRAW は 0）
    let grainDelta = 0;
    if (finalResult.includes('WIN')) grainDelta = +1;
    else if (finalResult === 'LOSE') grainDelta = -1;

    // 3. 自分の rank_status の粒を増減させる
    if (grainDelta !== 0) {
      await client.query(
        `UPDATE rank_status
         SET grains = GREATEST(0, grains + $1), updated_at = CURRENT_TIMESTAMP
         WHERE owner_id = $2`,
        [grainDelta, owner]
      );
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, match: res.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('対戦レコード保存エラー:', error);
    return NextResponse.json({ error: 'Failed to save match' }, { status: 500 });
  } finally {
    client.release();
  }
}

// 自分の対戦レコードの削除（勝敗に応じて、自分の rank_status の粒を巻き戻す）
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

    // 2. 勝敗から粒の増減を逆算（WIN 系は -1、LOSE は +1、DRAW は 0）
    const result: string = deleted.rows[0].result ?? '';
    let grainDelta = 0;
    if (result.includes('WIN')) grainDelta = -1;
    else if (result === 'LOSE') grainDelta = +1;

    // 3. 自分の rank_status の粒を調整
    if (grainDelta !== 0) {
      await client.query(
        `UPDATE rank_status
         SET grains = GREATEST(0, grains + $1), updated_at = CURRENT_TIMESTAMP
         WHERE owner_id = $2`,
        [grainDelta, owner]
      );
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('レコード削除エラー:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    client.release();
  }
}