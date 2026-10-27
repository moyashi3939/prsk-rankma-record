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

// ランクポイントボーナス（判定マッチのあとの、すべてのランクにある。マスターも同じ）。100たまると、ランクポイント（粒）が1つ増える。
//  ・ALL PERFECT +20 / フルコンボ +10（APとFCは重複しない）
//  ・上位クラスに勝利 +10
//  ・ライフ0 −30（ボーナスは0未満にはならず、粒も減らない）
// ★ ゲームの仕様が変わったときは、ここの数字を書き換えてください。
export const BONUS_RULES = {
  allPerfect: 20,
  fullCombo: 10,
  higherClassWin: 10,
  lifeZero: -30,
  perGrain: 100,
} as const;

// 1試合の内容（ボーナスの計算に使う）
export interface MatchFlags {
  isAP: boolean;
  isFC: boolean;
  isLifeZero: boolean;
  isOpponentHigher: boolean; // 相手が格上（上位クラス）だったか
}

export const NO_FLAGS: MatchFlags = { isAP: false, isFC: false, isLifeZero: false, isOpponentHigher: false };

// 保存済みの対戦1件（結果と、内容）
export interface MatchRecordLite {
  result: string;
  flags: MatchFlags;
}

// 1試合で増減する、ランクポイントボーナスの値
export function bonusDelta(result: string, f: MatchFlags): number {
  let delta = 0;
  if (f.isAP) delta += BONUS_RULES.allPerfect;
  else if (f.isFC) delta += BONUS_RULES.fullCombo;
  if (f.isOpponentHigher && result === 'WIN') delta += BONUS_RULES.higherClassWin;
  if (f.isLifeZero) delta += BONUS_RULES.lifeZero;
  return delta;
}

export interface RankState {
  rankName: string;
  classIndex: number;
  grains: number;
  placementMatchesPlayed: number;
  isPlacementCompleted: boolean;
  bonus: number; // ランクポイントボーナス（0〜99）
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
  startBonus: number;
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
    bonus: row.bonus ?? 0,
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
    bonus: row.bonus ?? 0,
  };
}

export function baselineFromRow(row: any): Baseline {
  return {
    startRankName: row.start_rank_name ?? null,
    startClassIndex: row.start_class_index ?? 0,
    startGrains: row.start_grains ?? 0,
    startBonus: row.start_bonus ?? 0,
    placementChoice: row.placement_rank_name
      ? { rankName: row.placement_rank_name, classIndex: row.placement_class_index ?? 0 }
      : null,
  };
}

// 最初の状態
export function initialState(b: Baseline): RankState {
  if (!b.startRankName) {
    return { rankName: PLACEMENT_NAME, classIndex: 0, grains: 0, placementMatchesPlayed: 0, isPlacementCompleted: false, bonus: 0 };
  }
  return {
    rankName: b.startRankName,
    classIndex: b.startRankName === MASTER ? 0 : b.startClassIndex,
    grains: b.startGrains,
    placementMatchesPlayed: PLACEMENT_MATCHES,
    isPlacementCompleted: true,
    bonus: b.startBonus,
  };
}

// 粒を1つ増やす
//  ・5粒を超えたら、次のクラスの1粒目へ（クラスアップ）
//  ・クラス4で5粒を超えたら、次のランクのクラス1の1粒目へ（ランクアップ。マスターは、クラスなしで1粒から）
//  ・マスターは、粒が無限に増える
// ※ ランクは自動で下がらない（ランクの降格は廃止）。下がるのは、クラスだけ。
function gainGrain(s: { rankName: string; classIndex: number; grains: number }) {
  if (s.rankName === MASTER) {
    s.grains += 1;
    return;
  }
  s.grains += 1;
  if (s.grains >= MAX_GRAINS + 1) {
    if (s.classIndex < CLASS_COUNT - 1) {
      s.classIndex += 1;
      s.grains = 1;
    } else {
      const idx = (RANKS as readonly string[]).indexOf(s.rankName);
      const nextRank = idx >= 0 ? RANKS[idx + 1] : undefined;
      if (nextRank) {
        s.rankName = nextRank; // ランクアップ
        s.classIndex = 0;
        s.grains = 1;
      } else {
        s.grains = MAX_GRAINS;
      }
    }
  }
}

// 1試合ぶんの結果を当てはめる（result は 'WIN' | 'LOSE' | 'DRAW' | 'WIN (AP DRAW)'）
export function applyResult(
  state: RankState,
  result: string,
  choice: PlacementChoice | null,
  flags: MatchFlags = NO_FLAGS
): RankState {
  const isWin = result.includes('WIN');
  const isLose = result === 'LOSE';
  const next = { ...state };

  if (!next.isPlacementCompleted) {
    // 判定マッチ中：勝敗に関わらず1戦進む（ボーナスはない）
    next.placementMatchesPlayed += 1;
    if (next.placementMatchesPlayed >= PLACEMENT_MATCHES) {
      next.isPlacementCompleted = true;
      next.bonus = 0;
      if (choice) {
        // 判定マッチ後に選んだランクで配属される（配属直後は1粒）
        next.rankName = choice.rankName;
        next.classIndex = choice.rankName === MASTER ? 0 : choice.classIndex;
        next.grains = 1;
      }
      // choice がないときは rankName が「判定マッチ」のまま（画面でランクを選んでもらう）
    }
    return next;
  }

  const isMasterRank = next.rankName === MASTER;

  if (isMasterRank) {
    // マスター：粒は無限に増える。負けると1粒減る（0未満にはならない）
    if (isWin) next.grains += 1;
    else if (isLose) next.grains = Math.max(0, next.grains - 1);
  } else if (isWin) {
    gainGrain(next);
  } else if (isLose) {
    next.grains -= 1;
    if (next.grains < 0) {
      if (next.classIndex > 0) {
        next.classIndex -= 1; // クラスダウン（4粒から）
        next.grains = 4;
      } else {
        next.grains = 0; // クラス1で0粒のときは、これ以上下がらない（ランクは自動で下がらない）
      }
    }
  }

  // ランクポイントボーナス：増減したあと、100たまるごとに、粒を1つ増やす（0未満にはならない）
  next.bonus += bonusDelta(result, flags);
  if (next.bonus < 0) next.bonus = 0;
  while (next.bonus >= BONUS_RULES.perGrain) {
    next.bonus -= BONUS_RULES.perGrain;
    gainGrain(next);
  }

  return next;
}

// 最初の状態から、対戦結果を古い順にすべて当てはめて、現在の状態を求める
export function replay(baseline: Baseline, records: MatchRecordLite[]): RankState {
  let state = initialState(baseline);
  for (const r of records) {
    state = applyResult(state, r.result, baseline.placementChoice, r.flags);
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
      bonus: 0,
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
  bonus?: unknown;
}): { ok: true; value: { rankName: string; classIndex: number; grains: number; bonus: number } } | { ok: false; error: string } {
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

  // ランクポイントボーナス（マスターも同じ）
  let bonus = 0;
  if (input.bonus !== undefined && input.bonus !== null && input.bonus !== '') {
    bonus = Number(input.bonus);
    if (!Number.isInteger(bonus) || bonus < 0 || bonus >= BONUS_RULES.perGrain) {
      return { ok: false, error: `ボーナスは0〜${BONUS_RULES.perGrain - 1}で入力してください` };
    }
  }

  return { ok: true, value: { rankName, classIndex, grains, bonus } };
}

// ランク状態を、画面・通知に出す文章にする（例: 「プラチナ クラス 2 3粒」）
export function describeRankState(state: RankState): string {
  if (!state.isPlacementCompleted) return `判定マッチ ${state.placementMatchesPlayed}/${PLACEMENT_MATCHES}戦`;
  if (state.rankName === PLACEMENT_NAME) return '判定マッチ完了（アプリでランクを選んでください）';
  if (state.rankName === MASTER) return `${MASTER} ${state.grains}粒（ボーナス ${state.bonus}）`;
  return `${state.rankName} クラス ${state.classIndex + 1} ${state.grains}粒（ボーナス ${state.bonus}）`;
}
