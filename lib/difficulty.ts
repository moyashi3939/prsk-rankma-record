// lib/difficulty.ts
// 難易度の名前の一覧（アプリ全体で共通）。

// ゲームにある難易度すべて（低い → 高い）。データの確認（「壊れたデータ」の判定など）には、これを使う
export const ALL_DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'EXPERT', 'MASTER', 'APPEND'] as const;

// 手で入力するとき（登録のない曲）の、選択肢
export const SELECTABLE_DIFFICULTIES = ['HARD', 'EXPERT', 'MASTER', 'APPEND'] as const;

// 難易度の並び順（EASY → … → APPEND）。表示の順番をそろえるのに使う
export const compareDifficulty = (a: string, b: string): number => {
  const order = ALL_DIFFICULTIES as readonly string[];
  return order.indexOf(a) - order.indexOf(b);
};

export const isKnownDifficulty = (d: string): boolean => (ALL_DIFFICULTIES as readonly string[]).includes(d);
