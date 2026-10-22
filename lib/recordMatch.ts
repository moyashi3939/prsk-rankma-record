// lib/recordMatch.ts
// サーバー側で「対戦を1件記録して、ランク・粒も更新する」処理（1つのトランザクション）。
// iOSショートカットで送られた画像の、自動登録に使う。
// 記録画面（ブラウザ）と同じ計算（lib/matchCalc.ts / lib/rank.ts）を使う。
import { getClient } from '@/lib/db';
import { ensureOwnerColumns, getDefaultSeason } from '@/lib/schema';
import { actualResultOf, calcMatch, type MatchCalcResult } from '@/lib/matchCalc';
import { applyResult, describeRankState, formatRankStatus, stateFromRow } from '@/lib/rank';

export interface RecordMatchInput {
  songName: string;
  difficulty: string;
  level: string;
  totalNotes: number;
  isOpponentHigher?: boolean;
  my: { perfect: number; great: number; good: number; bad: number; miss: number };
  opp: { great: number; good: number; bad: number; miss: number };
}

export interface RecordMatchOutput {
  match: any;
  rankStatus: ReturnType<typeof formatRankStatus>;
  rankText: string;
  calc: MatchCalcResult;
  actualResult: string;
}

export async function recordMatchForOwner(owner: string, input: RecordMatchInput): Promise<RecordMatchOutput> {
  await ensureOwnerColumns();

  const calc = calcMatch({
    totalNotes: input.totalNotes,
    myPerfect: input.my.perfect,
    myGreat: input.my.great,
    myGood: input.my.good,
    myBad: input.my.bad,
    myMiss: input.my.miss,
    oppGreat: input.opp.great,
    oppGood: input.opp.good,
    oppBad: input.opp.bad,
    oppMiss: input.opp.miss,
  });
  const actualResult = actualResultOf(calc.result, calc.isBothAP);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 自分のランク状態（なければ、判定マッチの初期状態を作る）
    let rankRes = await client.query('SELECT * FROM rank_status WHERE owner_id = $1 FOR UPDATE', [owner]);
    if (rankRes.rows.length === 0) {
      rankRes = await client.query(
        `INSERT INTO rank_status (owner_id, season_id, rank_name, class_index, grains, placement_matches_played, is_placement_completed)
         VALUES ($1, $2, '判定マッチ', 0, 0, 0, FALSE)
         RETURNING *`,
        [owner, await getDefaultSeason()]
      );
    }
    const rankRow = rankRes.rows[0];

    // 対戦を記録（保存する項目は、記録画面と同じ）
    const inserted = await client.query(
      `INSERT INTO matches (
         song_name, difficulty, level, is_opponent_higher,
         my_perf, my_great, my_good, my_bad, my_miss,
         opp_perf, opp_great, opp_good, opp_bad, opp_miss,
         my_score, opp_score, result, owner_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        input.songName,
        input.difficulty,
        input.level,
        input.isOpponentHigher ?? false,
        calc.myPerf,
        input.my.great,
        input.my.good,
        input.my.bad,
        input.my.miss,
        calc.oppPerf,
        input.opp.great,
        input.opp.good,
        input.opp.bad,
        input.opp.miss,
        calc.myScore,
        calc.oppScore,
        actualResult,
        owner,
      ]
    );

    // ランク・粒を更新（判定マッチが終わるときの、ランクの選択は、アプリを開いたときに行う）
    const next = applyResult(stateFromRow(rankRow), actualResult, null);
    const updated = await client.query(
      `UPDATE rank_status
       SET rank_name = $1, class_index = $2, grains = $3,
           placement_matches_played = $4, is_placement_completed = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [next.rankName, next.classIndex, next.grains, next.placementMatchesPlayed, next.isPlacementCompleted, rankRow.id]
    );

    await client.query('COMMIT');
    return {
      match: inserted.rows[0],
      rankStatus: formatRankStatus(updated.rows[0]),
      rankText: describeRankState(next),
      calc,
      actualResult,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
