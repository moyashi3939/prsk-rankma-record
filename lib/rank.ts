// lib/rank.ts
// ランクマッチの「粒・クラス・判定マッチ」の計算ルール。
// app/page.tsx の記録処理と同じルールを、サーバー側でも使えるようにしたもの。
// 対戦履歴を削除したとき、「最初の状態」から残りの対戦を順に当てはめ直して、現在の状態を求める（replay）。

export const RANKS = ['ルーキー', 'ブロンズ', 'シルバー', 'ゴールド', 'プラチナ', 'ダイヤモンド', 'マスター'] as const;
export const CLASS_COUNT = 4; // クラス1〜4
export const MAX_GRAINS = 5; // マスター以外の、1クラスの粒の上限
export const PLACEMENT_MATCHES = 3; // 判定マッチの試合数
export const MASTER = 'マスター';
export const PLACEMENT_NAME = '判定マッチ';

export interface RankState {
  rankName: string;
  classIndex: number;
  grains: number;
  placementMatchesPlayed: number;
  isPlacementCompleted: boolean;
}

// 判定マッチのあとに選んだランク・クラス
export interface PlacementChoice {
  rankName: string;
  classIndex: number;
}

// 「最初の状態」
//  startRankName が null … 判定マッチから開始
//  それ以外 … 指定したランク・クラス・粒から開始（途中参加）
export interface Baseline {
  startRankName: string | null;
  startClassIndex: number;
  startGrains: number;
  placementChoice: PlacementChoice | null;
}

// DBの行 → 画面用の形
export function formatRankStatus(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    seasonId: row.season_id,
    rankName: row.rank_name,
    classIndex: row.class_index,
    grains: row.grains,
    placementMatchesPlayed: row.placement_matches_played,
    isPlacementCompleted: row.is_placement_completed,
    setupDone: !!row.setup_done,
    updatedAt: row.updated_at,
  };
}

export function stateFromRow(row: any): RankState {
  return {
    rankName: row.rank_name ?? PLACEMENT_NAME,
    classIndex: row.class_index ?? 0,
    grains: row.grains ?? 0,
    placementMatchesPlayed: row.placement_matches_played ?? 0,
    isPlacementCompleted: !!row.is_placement_completed,
  };
}

export function baselineFromRow(row: any): Baseline {
  return {
    startRankName: row.start_rank_name ?? null,
    startClassIndex: row.start_class_index ?? 0,
    startGrains: row.start_grains ?? 0,
    placementChoice: row.placement_rank_name
      ? { rankName: row.placement_rank_name, classIndex: row.placement_class_index ?? 0 }
      : null,
  };
}

// 最初の状態
export function initialState(b: Baseline): RankState {
  if (!b.startRankName) {
    return { rankName: PLACEMENT_NAME, classIndex: 0, grains: 0, placementMatchesPlayed: 0, isPlacementCompleted: false };
  }
  return {
    rankName: b.startRankName,
    classIndex: b.startRankName === MASTER ? 0 : b.startClassIndex,
    grains: b.startGrains,
    placementMatchesPlayed: PLACEMENT_MATCHES,
    isPlacementCompleted: true,
  };
}

// 1試合ぶんの結果を当てはめる（result は 'WIN' | 'LOSE' | 'DRAW' | 'WIN (AP DRAW)'）
export function applyResult(state: RankState, result: string, choice: PlacementChoice | null): RankState {
  const isWin = result.includes('WIN');
  const isLose = result === 'LOSE';
  let { rankName, classIndex, grains, placementMatchesPlayed, isPlacementCompleted } = state;

  if (!isPlacementCompleted) {
    // 判定マッチ中：勝敗に関わらず1戦進む
    placementMatchesPlayed += 1;
    if (placementMatchesPlayed >= PLACEMENT_MATCHES) {
      isPlacementCompleted = true;
      if (choice) {
        // 判定マッチ後に選んだランクで配属される（配属直後は1粒）
        rankName = choice.rankName;
        classIndex = choice.rankName === MASTER ? 0 : choice.classIndex;
        grains = 1;
      }
      // choice がないときは rankName が「判定マッチ」のまま（画面でランクを選んでもらう）
    }
  } else if (rankName === MASTER) {
    // マスター：粒は無限に増える。負けると1粒減る（0未満にはならない）
    if (isWin) grains += 1;
    else if (isLose) grains = Math.max(0, grains - 1);
  } else if (isWin) {
    grains += 1;
    if (grains >= MAX_GRAINS + 1) {
      if (classIndex < CLASS_COUNT - 1) {
        classIndex += 1; // クラスアップ（1粒から）
        grains = 1;
      } else {
        grains = MAX_GRAINS; // 最高クラスは5粒で止まる
      }
    }
  } else if (isLose) {
    grains -= 1;
    if (grains < 0) {
      if (classIndex > 0) {
        classIndex -= 1; // クラスダウン（4粒から）
        grains = 4;
      } else {
        grains = 0;
      }
    }
  }

  return { rankName, classIndex, grains, placementMatchesPlayed, isPlacementCompleted };
}

// 最初の状態から、対戦結果を古い順にすべて当てはめて、現在の状態を求める
export function replay(baseline: Baseline, results: string[]): RankState {
  let state = initialState(baseline);
  for (const r of results) {
    state = applyResult(state, r, baseline.placementChoice);
  }
  return state;
}

// 「最初の状態」が分からない古いデータ用：削除した1試合ぶんを、現在の状態から1つ戻す（近似）
// ・粒が増減する境目（クラスアップ・ダウン、上限・下限）は、どちらから来たか決まらないことがあるので、
//   いちばんありそうな方に戻す
export function revertLegacy(state: RankState, deletedResult: string, remainingCount: number): RankState {
  // 残りが判定マッチの試合数に満たないなら、判定マッチの途中に戻す
  if (!state.isPlacementCompleted || remainingCount < PLACEMENT_MATCHES) {
    return {
      rankName: PLACEMENT_NAME,
      classIndex: 0,
      grains: 0,
      placementMatchesPlayed: Math.min(remainingCount, PLACEMENT_MATCHES - 1),
      isPlacementCompleted: false,
    };
  }

  const isWin = deletedResult.includes('WIN');
  const isLose = deletedResult === 'LOSE';
  let { classIndex, grains } = state;

  if (state.rankName === MASTER) {
    if (isWin) grains = Math.max(0, grains - 1);
    else if (isLose) grains += 1;
  } else if (isWin) {
    if (grains === 1 && classIndex > 0) {
      classIndex -= 1; // クラスアップした直後 → 前のクラスの5粒
      grains = MAX_GRAINS;
    } else {
      grains = Math.max(0, grains - 1);
    }
  } else if (isLose) {
    // クラスダウンした直後（4粒）かもしれないが、判別できないので通常の戻し方（1粒増やす）にする
    grains = Math.min(MAX_GRAINS, grains + 1);
  }

  return { ...state, classIndex, grains };
}

// 「最初の状態を指定して始める」の入力チェック
export function validateStart(input: {
  rankName: unknown;
  classIndex: unknown;
  grains: unknown;
}): { ok: true; value: { rankName: string; classIndex: number; grains: number } } | { ok: false; error: string } {
  const rankName = input.rankName;
  if (typeof rankName !== 'string' || !(RANKS as readonly string[]).includes(rankName)) {
    return { ok: false, error: 'ランクが正しくありません' };
  }

  const isMaster = rankName === MASTER;
  const classIndex = isMaster ? 0 : Number(input.classIndex);
  if (!Number.isInteger(classIndex) || classIndex < 0 || classIndex >= CLASS_COUNT) {
    return { ok: false, error: 'クラスが正しくありません' };
  }

  const grains = Number(input.grains);
  const maxGrains = isMaster ? 99999 : MAX_GRAINS;
  if (!Number.isInteger(grains) || grains < 0 || grains > maxGrains) {
    return { ok: false, error: isMaster ? '粒は0以上の整数で入力してください' : `粒は0〜${MAX_GRAINS}で入力してください` };
  }

  return { ok: true, value: { rankName, classIndex, grains } };
}
