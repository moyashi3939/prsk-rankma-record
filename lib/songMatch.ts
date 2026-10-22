// lib/songMatch.ts
// 読み取った「判定の合計（総ノーツ数）」「ジャケット」「ジャケットのまわりの色」から、曲と難易度を決める。
// 記録画面（ブラウザ）と、iOSショートカットの自動登録（サーバー）で同じ判断をするための共通のコード。
import { findJacketMatches, jacketDistance, normalizeJacketHex, type JacketRecord, type RGB } from '@/lib/ocrCore';

export interface SongRow {
  id?: number;
  song_name: string;
  difficulty: string;
  level: string | number;
  total_notes: number | string;
}

export interface DifficultyColor {
  difficulty: string;
  r: number;
  g: number;
  b: number;
}

// ジャケットのまわりの色の、初期値（ゲーム内の難易度の色に近い値）。
// ★ ざっくりした値です。使っているうちに、実際に記録した画像の色を覚えて（difficulty_colors テーブル）、
//    その値のほうを優先して使います。
export const DEFAULT_DIFFICULTY_COLORS: DifficultyColor[] = [
  { difficulty: 'EXPERT', r: 238, g: 68, b: 68 },
  { difficulty: 'MASTER', r: 187, g: 51, b: 238 },
  { difficulty: 'APPEND', r: 255, g: 136, b: 221 },
];

// ============================================================
// 枠の色 → 難易度
// ============================================================

function toHsv({ r, g, b }: RGB) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// 色が「はっきりした色」か（灰色や暗い色は、枠ではなく背景を測っている可能性が高い）
export function isUsableRingColor(color: RGB | null | undefined): color is RGB {
  if (!color) return false;
  const { s, v } = toHsv(color);
  return s >= 0.25 && v >= 0.3;
}

const CLEAR_MAX_DISTANCE = 30; // 色相の差(度)がこれ以内なら「その難易度の色」
const CLEAR_MIN_GAP = 15; // 2番目に近い難易度との差(度)がこれ以上あれば「はっきり判別できた」

// 枠の色から難易度を推定する。はっきり判別できたときだけ返す（そうでなければ null）
export function classifyDifficultyByColor(ring: RGB | null | undefined, learned: DifficultyColor[] = []): string | null {
  if (!isUsableRingColor(ring)) return null;

  // 覚えた色があれば、初期値より優先する
  const refs = new Map<string, DifficultyColor>();
  for (const c of DEFAULT_DIFFICULTY_COLORS) refs.set(c.difficulty, c);
  for (const c of learned) refs.set(c.difficulty, c);

  const hue = toHsv(ring).h;
  const scored = Array.from(refs.values())
    .map((c) => ({ difficulty: c.difficulty, dist: hueDistance(hue, toHsv(c).h) }))
    .sort((a, b) => a.dist - b.dist);

  if (scored.length === 0) return null;
  const best = scored[0];
  const second = scored[1];
  if (best.dist > CLEAR_MAX_DISTANCE) return null;
  if (second && second.dist - best.dist < CLEAR_MIN_GAP) return null;
  return best.difficulty;
}

// ============================================================
// 曲・難易度の判別
// ============================================================

export type Confidence = 'high' | 'medium' | 'low';

export interface IdentifyInput {
  total: number | null; // 自分の判定の合計（読み取れなかったら null）
  jacketHex: string | null;
  ring: RGB | null;
  preferredDifficulty?: string; // いま画面で選んでいる難易度（ヒント）
  songs: SongRow[];
  jackets: JacketRecord[];
  difficultyColors?: DifficultyColor[];
}

export interface IdentifyResult {
  chart: SongRow | null; // 決まった譜面
  songName: string | null; // 譜面までは決まらなかったけれど、曲名は分かったとき
  confidence: Confidence; // high = 確信がある（自動登録してよい） / medium = ほぼ合っている / low = 自信がない
  colorDifficulty: string | null; // 枠の色から推定した難易度
  reasons: string[]; // 画面に出す説明
  others: SongRow[]; // 他の候補（決まった譜面は含まない）
}

const MAX_OTHERS = 12;
const NEAR_JACKET_LIMIT = 3; // ジャケットが「しきい値より少し遠い」曲も、候補として何曲まで出すか
const NEAR_JACKET_MAX_DISTANCE = 0.6;

const notesOf = (s: SongRow) => Number(s.total_notes);
const keyOf = (s: SongRow) => `${s.song_name}\u0000${s.difficulty}`;

export function identifySong(input: IdentifyInput): IdentifyResult {
  const { total, songs, jackets } = input;
  const reasons: string[] = [];

  const byNotes = total === null ? [] : songs.filter((s) => notesOf(s) === total);
  const colorDifficulty = classifyDifficultyByColor(input.ring, input.difficultyColors);

  // ジャケットに近い曲（近い順）
  const jacketMatches = input.jacketHex ? findJacketMatches(input.jacketHex, jackets) : [];
  const nearNames = jacketMatches.map((j) => j.songName);

  let chart: SongRow | null = null;
  let songName: string | null = null;
  let confidence: Confidence = 'low';

  if (jacketMatches.length > 0) {
    // ---- ジャケットで曲が絞れた ----
    const rank = (s: SongRow) => nearNames.indexOf(s.song_name);
    const pool = byNotes.filter((s) => nearNames.includes(s.song_name));

    if (pool.length > 0) {
      const bestRank = Math.min(...pool.map(rank));
      const top = pool.filter((s) => rank(s) === bestRank); // いちばんジャケットが近い曲の譜面

      if (top.length === 1) {
        chart = top[0];
        confidence = 'high';
        if (colorDifficulty && colorDifficulty !== chart.difficulty) {
          // 枠の色が、決まった譜面の難易度と食い違う
          confidence = 'medium';
          reasons.push(`枠の色は ${colorDifficulty} に見えますが、ノーツ数が合う譜面は ${chart.difficulty} です。念のため確認してください。`);
        }
      } else {
        // 同じ曲で総ノーツ数が同じ譜面が複数ある → 枠の色、なければ選択中の難易度で決める
        const byColor = colorDifficulty ? top.filter((s) => s.difficulty === colorDifficulty) : [];
        const byPreferred = top.filter((s) => s.difficulty === input.preferredDifficulty);
        if (byColor.length === 1) {
          chart = byColor[0];
          confidence = 'medium';
          reasons.push(`同じ曲で総ノーツ数が同じ譜面が複数あったため、ジャケットの枠の色（${colorDifficulty}）で決めました。`);
        } else if (byPreferred.length === 1) {
          chart = byPreferred[0];
          confidence = 'low';
          reasons.push(`同じ曲で総ノーツ数が同じ譜面が複数あったため、選択中の難易度（${input.preferredDifficulty}）で決めました。違う場合は、下の候補から選び直してください。`);
        } else {
          songName = top[0].song_name;
          reasons.push('同じ曲で総ノーツ数が同じ譜面が複数あります。難易度を選んでください。');
        }
      }
    } else {
      songName = jacketMatches[0].songName;
      reasons.push(
        total === null
          ? `ジャケットから「${songName}」と判断しました。難易度を選んでください。`
          : `ジャケットから「${songName}」と判断しましたが、総ノーツ数 ${total} の譜面が見つかりません。難易度を確認してください。`
      );
    }
  } else if (total !== null) {
    // ---- ジャケットでは決まらない → 総ノーツ数（と、枠の色）で探す ----
    if (byNotes.length === 1) {
      chart = byNotes[0];
      confidence = 'medium';
      reasons.push('ジャケットは未登録ですが、総ノーツ数から曲が1つに決まりました。内容を確認してください。');
    } else if (byNotes.length > 1) {
      const byColor = colorDifficulty ? byNotes.filter((s) => s.difficulty === colorDifficulty) : [];
      const byPreferred = byNotes.filter((s) => s.difficulty === input.preferredDifficulty);
      if (byColor.length === 1) {
        chart = byColor[0];
        confidence = 'low';
        reasons.push(`総ノーツ数 ${total} の曲が${byNotes.length}件ありましたが、ジャケットの枠の色（${colorDifficulty}）で1曲に絞りました。違う場合は、下の候補から選び直してください。`);
      } else if (byPreferred.length === 1) {
        chart = byPreferred[0];
        confidence = 'low';
        reasons.push(`総ノーツ数 ${total} の曲が${byNotes.length}件ありましたが、選択中の難易度（${input.preferredDifficulty}）で1曲に絞れたため入力しました。違う場合は、下の候補から選び直してください。`);
      } else {
        reasons.push(`総ノーツ数 ${total} に当てはまる曲が${byNotes.length}件あります。下の候補から選んでください。`);
      }
    } else {
      reasons.push(`総ノーツ数 ${total} の曲が登録されていません。曲名と難易度は手動で入力してください。`);
    }
  }

  // ---- 他の候補 ----
  const near = new Set(nearNames);
  // ジャケットが「しきい値より少し遠い」だけの曲も、念のため候補に入れる
  if (input.jacketHex) {
    const target = normalizeJacketHex(input.jacketHex);
    if (target) {
      jackets
        .map((j) => {
          const h = normalizeJacketHex(j.hex);
          return { name: j.songName, d: h ? jacketDistance(target, h) : Infinity };
        })
        .filter((x) => x.d <= NEAR_JACKET_MAX_DISTANCE && !near.has(x.name))
        .sort((a, b) => a.d - b.d)
        .slice(0, NEAR_JACKET_LIMIT)
        .forEach((x) => near.add(x.name));
    }
  }

  const candidates: { song: SongRow; score: number }[] = [];
  for (const s of songs) {
    const nearJacket = near.has(s.song_name);
    const sameNotes = total !== null && notesOf(s) === total;
    if (!nearJacket && !sameNotes) continue;
    // 小さいほど先に出す: ジャケットも合う ＞ ノーツ数だけ合う ＞ ジャケットだけ近い
    const score = nearJacket && sameNotes ? 0 : sameNotes ? 1 : 2;
    candidates.push({ song: s, score });
  }

  const seen = new Set<string>();
  if (chart) seen.add(keyOf(chart));
  const others: SongRow[] = [];
  candidates
    .sort((a, b) => a.score - b.score || a.song.song_name.localeCompare(b.song.song_name, 'ja'))
    .forEach(({ song }) => {
      const k = keyOf(song);
      if (!seen.has(k) && others.length < MAX_OTHERS) {
        seen.add(k);
        others.push(song);
      }
    });

  return { chart, songName, confidence, colorDifficulty, reasons, others };
}
