// app/api/matches/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

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

    const queryText = `
      INSERT INTO matches (
        song_name, difficulty, level, is_opponent_higher,
        my_perf, my_great, my_good, my_bad, my_miss,
        opp_perf, opp_great, opp_good, opp_bad, opp_miss,
        my_score, opp_score, result
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *;
    `;

    const values = [
      songName,
      difficulty,
      level,
      isOpponentHigher || false,
      myPerf || 0,
      parseInt(myGreat) || 0,
      parseInt(myGood) || 0,
      parseInt(myBad) || 0,
      parseInt(myMiss) || 0,
      oppPerf || 0,
      parseInt(oppGreat) || 0,
      parseInt(oppGood) || 0,
      parseInt(oppBad) || 0,
      parseInt(oppMiss) || 0,
      myScore || 0,
      oppScore || 0,
      result,
    ];

    const res = await query(queryText, values);
    return NextResponse.json({ success: true, match: res.rows[0] });
  } catch (error) {
    console.error('対戦レコード保存エラー:', error);
    return NextResponse.json({ error: 'Failed to save match' }, { status: 500 });
  }
}