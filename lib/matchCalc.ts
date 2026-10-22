// lib/matchCalc.ts
// 対戦の判定の数から、スコア・勝敗・AP/FC などを計算する。
// 記録画面（ブラウザ）と、iOSショートカットの自動登録（サーバー）で、同じ計算を使うための共通のコード。

export interface MatchCalcInput {
  totalNotes: number; // その曲の総ノーツ数（曲が分かっているとき）。0 のときは、自分の判定の合計を使う
  myPerfect: number; // 0 のときは「総ノーツ数 − 他の判定」で求める
  myGreat: number;
  myGood: number;
  myBad: number;
  myMiss: number;
  oppGreat: number;
  oppGood: number;
  oppBad: number;
  oppMiss: number;
}

export interface MatchCalcResult {
  totalNotes: number;
  myPerf: number;
  oppPerf: number;
  myScore: number;
  oppScore: number;
  myIsAP: boolean;
  myIsFC: boolean;
  isLifeZero: boolean;
  isBothAP: boolean;
  result: 'WIN' | 'LOSE' | 'DRAW';
}

export function calcMatch(input: MatchCalcInput): MatchCalcResult {
  const { myPerfect, myGreat, myGood, myBad, myMiss, oppGreat, oppGood, oppBad, oppMiss } = input;

  const totalNotes = input.totalNotes > 0 ? input.totalNotes : myPerfect + myGreat + myGood + myBad + myMiss;

  const myPerf = myPerfect > 0 ? myPerfect : Math.max(0, totalNotes - (myGreat + myGood + myBad + myMiss));
  const oppPerf = Math.max(0, totalNotes - (oppGreat + oppGood + oppBad + oppMiss));

  const score = (perf: number, great: number, good: number) => perf * 3 + great * 2 + good * 1;
  const myScore = score(myPerf, myGreat, myGood);
  const oppScore = score(oppPerf, oppGreat, oppGood);

  const myDamage = myMiss * 80 + myBad * 50;
  const isLifeZero = Math.max(0, 1000 - myDamage) <= 0;

  const myIsAP = myGreat === 0 && myGood === 0 && myBad === 0 && myMiss === 0 && myPerf > 0;
  const myIsFC = !myIsAP && myGood === 0 && myBad === 0 && myMiss === 0 && (myPerf > 0 || myGreat > 0);
  const oppIsAP = oppGreat === 0 && oppGood === 0 && oppBad === 0 && oppMiss === 0 && oppPerf > 0;

  let result: 'WIN' | 'LOSE' | 'DRAW' = 'DRAW';
  if (myScore > oppScore) result = 'WIN';
  else if (myScore < oppScore) result = 'LOSE';

  const isBothAP = result === 'DRAW' && myIsAP && oppIsAP;

  return { totalNotes, myPerf, oppPerf, myScore, oppScore, myIsAP, myIsFC, isLifeZero, isBothAP, result };
}

// 引き分けでも、お互いにAPなら「勝ち扱い」にする（ランクの粒の計算用）
export function actualResultOf(result: string, isBothAP: boolean): string {
  return result === 'DRAW' && isBothAP ? 'WIN (AP DRAW)' : result;
}
