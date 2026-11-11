// app/api/analytics/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureOwnerColumns } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';
import { toAMatch } from '@/lib/analytics';
import { baselineFromRow, initialState, rankPoints, replaySeries } from '@/lib/rank';
import { deriveMatchFlags } from '@/lib/matchCalc';

// 自分の対戦記録を、分析用の小さなデータにして返す。集計は、画面側で（フィルタを変えるたびに）行う。
// ランクの推移は、「最初の状態」が分かっているときだけ、対戦を最初から当てはめ直して作る。
export async function GET() {
  try {
    await ensureOwnerColumns();
    const owner = await getOwnerId();

    const matchesRes = await query('SELECT * FROM matches WHERE owner_id = $1 ORDER BY id ASC', [owner]);
    const rankRes = await query('SELECT * FROM rank_status WHERE owner_id = $1 LIMIT 1', [owner]);
    const rankRow = rankRes.rows[0];

    const matches = matchesRes.rows.map(toAMatch);

    // ランクの推移
    let rankProgress: { id: number; points: number | null; rank: string; classIndex: number; grains: number; bonus: number }[] | null = null;
    let rankStart: number | null = null;
    if (rankRow?.baseline_known) {
      const afterId: number = rankRow.baseline_after_id ?? 0;
      const rows = matchesRes.rows.filter((r) => r.id > afterId);
      const baseline = baselineFromRow(rankRow);
      const states = replaySeries(
        baseline,
        rows.map((r) => ({
          result: String(r.result ?? ''),
          flags: {
            ...deriveMatchFlags({
              perf: r.my_perf ?? 0,
              great: r.my_great ?? 0,
              good: r.my_good ?? 0,
              bad: r.my_bad ?? 0,
              miss: r.my_miss ?? 0,
            }),
            isOpponentHigher: !!r.is_opponent_higher,
          },
        }))
      );
      rankStart = rankPoints(initialState(baseline));
      rankProgress = states.map((st, i) => ({
        id: rows[i].id,
        points: rankPoints(st),
        rank: st.rankName,
        classIndex: st.classIndex,
        grains: st.grains,
        bonus: st.bonus,
      }));
    }

    const seasons = Array.from(new Set(matches.map((m) => m.seasonId).filter((s): s is string => !!s)));

    return NextResponse.json({
      matches,
      rankProgress,
      rankStart,
      seasons,
      currentSeason: rankRow?.season_id ?? null,
    });
  } catch (error) {
    console.error('分析データ取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
