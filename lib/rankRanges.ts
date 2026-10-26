// lib/rankRanges.ts
// ランクマッチで、ランクごとに出題される曲のレベルの範囲。
// 曲・難易度を決めるときに、「いまのランクで出る曲か」を手がかりにする（lib/songMatch.ts）。
//
// ★ ここの数字は、ネット上の情報（ひまじんゲーム 2026年 など）をもとにした「ざっくりの値」です。
//    シーズンによって変わることがあるので、公式Wiki などで確かめて、書き換えてください。
//    （書き換えるだけで、画面・自動登録の両方に反映されます）
//
// ・main   … EXPERT / MASTER のレベルの範囲（max を書かなければ、上限なし）
// ・append … APPEND のレベルの範囲（書かなければ、そのランクでは APPEND は出ない）
// ・判定マッチ中・ランク未設定のときは、範囲を使わない
//
// 範囲の外の曲が出ても、記録はできます（候補の並び順と、確認の注意に使うだけ）。
// 「となりのランクの範囲」は、格差マッチング（上位・下位のランクの人との対戦）で出ることがあるため、別扱いにしています。

export interface LevelRange {
  min: number;
  max?: number;
}

export interface RankSongRange {
  main: LevelRange;
  append?: LevelRange;
}

// ランクの順番（低い → 高い）。アプリの表示名に合わせる（「ルーキー」は、ゲームの「ビギナー」にあたる）
export const RANK_ORDER = ['ルーキー', 'ブロンズ', 'シルバー', 'ゴールド', 'プラチナ', 'ダイヤモンド', 'マスター'] as const;

export const RANK_SONG_RANGES: Record<string, RankSongRange> = {
  ルーキー: { main: { min: 18, max: 25 } },
  ブロンズ: { main: { min: 23, max: 26 } },
  シルバー: { main: { min: 25, max: 28 } },
  ゴールド: { main: { min: 26, max: 30 } },
  プラチナ: { main: { min: 28, max: 31 } },
  ダイヤモンド: { main: { min: 29, max: 32 }, append: { min: 27, max: 30 } },
  マスター: { main: { min: 30 }, append: { min: 28 } },
};

const inLevel = (level: number, r: LevelRange) => level >= r.min && (r.max === undefined || level <= r.max);

function chartInRange(range: RankSongRange | undefined, difficulty: string, level: number): boolean {
  if (!range) return false;
  if (difficulty === 'APPEND') return !!range.append && inLevel(level, range.append);
  return inLevel(level, range.main);
}

// その譜面が、いまのランクで出る曲かどうか
//   0    … 自分のランクの範囲内
//   1    … となりのランクの範囲内（格差マッチングで出ることがある）
//   2    … 範囲外
//   null … 判定できない（判定マッチ中・ランク未設定・レベルが数字でない）
export function rankRangeTier(
  rankName: string | null | undefined,
  difficulty: string,
  level: string | number
): 0 | 1 | 2 | null {
  if (!rankName || !(rankName in RANK_SONG_RANGES)) return null;
  const lv = Number(level);
  if (!Number.isFinite(lv)) return null;

  if (chartInRange(RANK_SONG_RANGES[rankName], difficulty, lv)) return 0;

  const idx = (RANK_ORDER as readonly string[]).indexOf(rankName);
  for (const neighbor of [RANK_ORDER[idx - 1], RANK_ORDER[idx + 1]]) {
    if (neighbor && chartInRange(RANK_SONG_RANGES[neighbor], difficulty, lv)) return 1;
  }
  return 2;
}
