import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const matchesResult = await query('SELECT * FROM matches ORDER BY id ASC');
    const matches = matchesResult.rows;

    const totalMatches = matches.length;

    if (totalMatches === 0) {
      return NextResponse.json({
        summary: { total: 0, wins: 0, winRate: 0, fcRate: 0, apRate: 0, neuralIndex: 0, avgScoreDiff: 0 },
        timeline: [],
        songAnalysis: [],
      });
    }

    let wins = 0;
    let fcCount = 0;
    let apCount = 0;
    let totalScoreDiff = 0;

    const songStatsMap: { [key: string]: { wins: number; total: number; totalScore: number } } = {};

    const timeline = matches.map((m, index) => {
      const isWin = m.result.includes('WIN');
      if (isWin) wins++;

      const perf = m.my_perf ?? 0;
      const great = m.my_great ?? 0;
      const good = m.my_good ?? 0;
      const bad = m.my_bad ?? 0;
      const miss = m.my_miss ?? 0;

      // 厳密なFC / AP判定
      const totalNotes = perf + great + good + bad + miss;
      const isFC = miss === 0 && bad === 0 && totalNotes > 0;
      const isAP = isFC && good === 0 && great === 0 && perf > 0;

      if (isFC) fcCount++;
      if (isAP) apCount++;

      const scoreDiff = (m.my_score ?? 0) - (m.opp_score ?? 0);
      totalScoreDiff += scoreDiff;

      const key = `${m.song_name} (${m.difficulty})`;
      if (!songStatsMap[key]) {
        songStatsMap[key] = { wins: 0, total: 0, totalScore: 0 };
      }
      songStatsMap[key].total++;
      if (isWin) songStatsMap[key].wins++;
      songStatsMap[key].totalScore += (m.my_score ?? 0);

      return {
        id: m.id,
        index: index + 1,
        songName: m.song_name,
        difficulty: m.difficulty,
        level: m.level,
        result: m.result,
        scoreDiff,
        myScore: m.my_score,
        oppScore: m.opp_score,
        createdAt: m.created_at,
      };
    });

    const winRate = Math.round((wins / totalMatches) * 100);
    const fcRate = Math.round((fcCount / totalMatches) * 100);
    const apRate = Math.round((apCount / totalMatches) * 100);
    const neuralIndex = Math.round((winRate * 1.5) + (fcRate * 0.8) + (apRate * 2) + Math.min(totalMatches * 2, 100));

    const songAnalysis = Object.keys(songStatsMap).map((key) => {
      const stat = songStatsMap[key];
      const winRate = Math.round((stat.wins / stat.total) * 100);
      return {
        name: key,
        total: stat.total,
        wins: stat.wins,
        winRate,
        avgScore: Math.round(stat.totalScore / stat.total),
      };
    }).sort((a, b) => b.winRate - a.winRate);

    return NextResponse.json({
      summary: {
        total: totalMatches,
        wins,
        winRate,
        fcRate,
        apRate,
        neuralIndex,
        avgScoreDiff: Math.round(totalScoreDiff / totalMatches),
      },
      timeline,
      songAnalysis,
    });
  } catch (error) {
    console.error('アナリティクス集計エラー:', error);
    return NextResponse.json({ error: 'Failed to analyze data' }, { status: 500 });
  }
}