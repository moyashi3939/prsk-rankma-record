// lib/jacketVariants.ts
// 同じ曲なのに、ジャケットが複数ある曲（バージョンなどで、ジャケットが変わるもの）と、その種類の数。
// 管理者画面（ジャケット管理）で、「あと何種類登録が必要か」を表示するのに使う。
// ※ 曲名は、DBに登録してある名前と同じにしてください（スペース・全角半角・大文字小文字の違いは、気にしません）。
//    新しい曲が見つかったら、ここに足してください。

export const EXPECTED_JACKET_VARIANTS: Record<string, number> = {
  シャルル: 2,
  雨とペトラ: 2,
  命ばっかり: 2,
  ノマド: 3,
  ペンタトニック: 2,
  KING: 2,
  フラジール: 2,
  群青賛歌: 2,
  レム: 2,
  花に風: 2,
};

// 1曲に、ユーザーの記録から自動で覚えるジャケットの、最大の数（管理者は、これより多く登録できる）
export const MAX_JACKET_VARIANTS = 5;
export const MAX_JACKET_VARIANTS_ADMIN = 10;

const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

const NORMALIZED = new Map(Object.entries(EXPECTED_JACKET_VARIANTS).map(([name, n]) => [normalize(name), n]));

// その曲に、ジャケットが何種類あるはずか（リストにない曲は 1）
export function expectedJacketVariants(songName: string): number {
  return NORMALIZED.get(normalize(songName)) ?? 1;
}
