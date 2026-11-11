// lib/analytics.ts
// 対戦記録の分析（集計）。画面（app/analytics/page.tsx）が、フィルタを変えるたびに、ここで計算し直す。
// サーバーからは、対戦1件ごとの、小さなデータ（AMatch）だけを受け取る。
import { deriveMatchFlags } from '@/lib/matchCalc';

export interface Judge {
  perf: number;
  great: number;
  good: number;
  bad: number;
  miss: number;
}

export interface AMatch {
  id: number;
  songName: string;
  difficulty: string;
  level: number | null;
  outcome: 'W' | 'L' | 'D'; // 勝ち・負け・引き分け（両者APの引き分けは、ランクの上では勝ち扱いなので W）
  ap: boolean; // 自分が ALL PERFECT
  fc: boolean; // 自分が FULL COMBO（APは除く）
  life0: boolean; // ライフ0
  higher: boolean; // 格上の相手
  myScore: number;
  oppScore: number;
  my: Judge;
  opp: Judge;
  notes: number; // 総ノーツ数（自分の判定の合計）
  createdAt: number | null; // 記録した日時（ミリ秒）
  seasonId: string | null;
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : parseInt(String(v ?? ''), 10) || 0);

// DBの行 → 分析用のデータ
export function toAMatch(row: any): AMatch {
  const my: Judge = { perf: n(row.my_perf), great: n(row.my_great), good: n(row.my_good), bad: n(row.my_bad), miss: n(row.my_miss) };
  const opp: Judge = { perf: n(row.opp_perf), great: n(row.opp_great), good: n(row.opp_good), bad: n(row.opp_bad), miss: n(row.opp_miss) };
  const result = String(row.result ?? '');
  const flags = deriveMatchFlags(my);
  const level = parseInt(String(row.level ?? ''), 10);
  const created = row.created_at ? new Date(row.created_at).getTime() : NaN;

  return {
    id: row.id,
    songName: String(row.song_name ?? ''),
    difficulty: String(row.difficulty ?? ''),
    level: Number.isFinite(level) ? level : null,
    outcome: result.includes('WIN') ? 'W' : result === 'LOSE' ? 'L' : 'D',
    ap: flags.isAP,
    fc: flags.isFC,
    life0: flags.isLifeZero,
    higher: !!row.is_opponent_higher,
    myScore: n(row.my_score),
    oppScore: n(row.opp_score),
    my,
    opp,
    notes: my.perf + my.great + my.good + my.bad + my.miss,
    createdAt: Number.isFinite(created) ? created : null,
    seasonId: row.season_id ?? null,
  };
}

// ---------------- 基本の集計 ----------------

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// 精度：自分のスコアが、満点（全部 PERFECT）の何%か（相手に関係なく、プレイそのものの出来を表す）
export function accuracyOf(m: AMatch): number | null {
  return m.notes > 0 ? (m.myScore / (3 * m.notes)) * 100 : null;
}

export interface Summary {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number; // %
  accuracy: number; // 平均の精度 %
  apCount: number;
  fcCount: number;
  life0Count: number;
  apRate: number;
  fcRate: number;
  avgScoreDiff: number;
}

export function summarize(ms: AMatch[]): Summary {
  const wins = ms.filter((m) => m.outcome === 'W').length;
  const losses = ms.filter((m) => m.outcome === 'L').length;
  const accs = ms.map(accuracyOf).filter((x): x is number => x !== null);
  const apCount = ms.filter((m) => m.ap).length;
  const fcCount = ms.filter((m) => m.fc).length;
  return {
    total: ms.length,
    wins,
    losses,
    draws: ms.length - wins - losses,
    winRate: pct(wins, ms.length),
    accuracy: avg(accs),
    apCount,
    fcCount,
    life0Count: ms.filter((m) => m.life0).length,
    apRate: pct(apCount, ms.length),
    fcRate: pct(fcCount, ms.length),
    avgScoreDiff: avg(ms.map((m) => m.myScore - m.oppScore)),
  };
}

// 連勝・連敗（引き分けは、ランクが変わらないので、途切れさせずに飛ばす）
export function streaks(ms: AMatch[]) {
  let curType: 'W' | 'L' | null = null;
  let cur = 0;
  let bestWin = 0;
  let bestLose = 0;
  for (const m of ms) {
    if (m.outcome === 'D') continue;
    if (m.outcome === curType) cur++;
    else {
      curType = m.outcome;
      cur = 1;
    }
    if (curType === 'W') bestWin = Math.max(bestWin, cur);
    else bestLose = Math.max(bestLose, cur);
  }
  return { current: cur, currentType: curType, bestWin, bestLose };
}

// 直近 window 戦の、勝率と精度の移り変わり（最初の数戦は、そこまでの全部で計算）
export function rolling(ms: AMatch[], window: number) {
  return ms.map((_, i) => {
    const slice = ms.slice(Math.max(0, i - window + 1), i + 1);
    const s = summarize(slice);
    return { index: i + 1, winRate: s.winRate, accuracy: s.accuracy };
  });
}

// ---------------- 内訳 ----------------

export interface Group {
  key: string;
  label: string;
  total: number;
  wins: number;
  winRate: number;
  accuracy: number;
  apRate: number;
}

function toGroup(key: string, label: string, ms: AMatch[]): Group {
  const s = summarize(ms);
  return { key, label, total: s.total, wins: s.wins, winRate: s.winRate, accuracy: s.accuracy, apRate: s.apRate };
}

const LEVEL_BUCKETS: { key: string; label: string; test: (lv: number) => boolean }[] = [
  { key: 'lv-24', label: 'Lv.24以下', test: (lv) => lv <= 24 },
  { key: 'lv-25', label: 'Lv.25〜26', test: (lv) => lv >= 25 && lv <= 26 },
  { key: 'lv-27', label: 'Lv.27〜28', test: (lv) => lv >= 27 && lv <= 28 },
  { key: 'lv-29', label: 'Lv.29〜30', test: (lv) => lv >= 29 && lv <= 30 },
  { key: 'lv-31', label: 'Lv.31以上', test: (lv) => lv >= 31 },
];

export function byLevel(ms: AMatch[]): Group[] {
  return LEVEL_BUCKETS.map((b) => toGroup(b.key, b.label, ms.filter((m) => m.level !== null && b.test(m.level)))).filter((g) => g.total > 0);
}

const DIFFICULTY_ORDER = ['EASY', 'NORMAL', 'HARD', 'EXPERT', 'MASTER', 'APPEND'];

export function byDifficulty(ms: AMatch[]): Group[] {
  const names = Array.from(new Set(ms.map((m) => m.difficulty))).sort((a, b) => DIFFICULTY_ORDER.indexOf(a) - DIFFICULTY_ORDER.indexOf(b));
  return names.map((d) => toGroup(d, d, ms.filter((m) => m.difficulty === d)));
}

// 時間帯・曜日（記録した日時から。ブラウザの時刻で数える）
export function byHour(ms: AMatch[]): Group[] {
  const slots = [
    { key: 'night', label: '深夜 0〜5時', test: (h: number) => h < 6 },
    { key: 'morning', label: '朝 6〜11時', test: (h: number) => h >= 6 && h < 12 },
    { key: 'day', label: '昼 12〜17時', test: (h: number) => h >= 12 && h < 18 },
    { key: 'evening', label: '夜 18〜23時', test: (h: number) => h >= 18 },
  ];
  const dated = ms.filter((m) => m.createdAt !== null);
  return slots.map((s) => toGroup(s.key, s.label, dated.filter((m) => s.test(new Date(m.createdAt as number).getHours())))).filter((g) => g.total > 0);
}

export function byWeekday(ms: AMatch[]): Group[] {
  const names = ['日', '月', '火', '水', '木', '金', '土'];
  const dated = ms.filter((m) => m.createdAt !== null);
  return names
    .map((name, d) => toGroup(`wd-${d}`, `${name}曜`, dated.filter((m) => new Date(m.createdAt as number).getDay() === d)))
    .filter((g) => g.total > 0);
}

// 判定の内訳：1試合あたりの、各判定の割合（%）。自分と相手を比べる
export function judgment(ms: AMatch[]) {
  const rate = (pick: (m: AMatch) => Judge) => {
    const total = ms.reduce((a, m) => a + m.notes, 0);
    const sum = (k: keyof Judge) => ms.reduce((a, m) => a + pick(m)[k], 0);
    return { perf: pct(sum('perf'), total), great: pct(sum('great'), total), good: pct(sum('good'), total), bad: pct(sum('bad'), total), miss: pct(sum('miss'), total) };
  };
  return { me: rate((m) => m.my), opp: rate((m) => m.opp) };
}

// 曲ごとの成績
export interface SongStat {
  key: string;
  name: string;
  difficulty: string;
  level: number | null;
  total: number;
  wins: number;
  winRate: number;
  accuracy: number;
  badMiss: number; // 1試合あたりの BAD + MISS の数
}

export function songStats(ms: AMatch[]): SongStat[] {
  const map = new Map<string, AMatch[]>();
  for (const m of ms) {
    const key = `${m.songName}\u0000${m.difficulty}`;
    (map.get(key) ?? map.set(key, []).get(key)!).push(m);
  }
  return Array.from(map, ([key, list]) => {
    const s = summarize(list);
    return {
      key,
      name: list[0].songName,
      difficulty: list[0].difficulty,
      level: list[0].level,
      total: s.total,
      wins: s.wins,
      winRate: s.winRate,
      accuracy: s.accuracy,
      badMiss: avg(list.map((m) => m.my.bad + m.my.miss)),
    };
  });
}

// 接戦（スコア差が小さい試合）の勝敗
export function closeGames(ms: AMatch[], threshold = 10) {
  const close = ms.filter((m) => Math.abs(m.myScore - m.oppScore) <= threshold && m.outcome !== 'D');
  const wins = close.filter((m) => m.outcome === 'W').length;
  return { total: close.length, wins, losses: close.length - wins, winRate: pct(wins, close.length) };
}

// ---------------- フィルタ ----------------

export interface Filter {
  period: 'all' | 'last30' | 'last100' | 'season';
  season: string | null; // period が 'season' のとき
  difficulty: string; // 'all' か 難易度名
}

export function applyFilter(ms: AMatch[], f: Filter): AMatch[] {
  let out = ms;
  if (f.difficulty !== 'all') out = out.filter((m) => m.difficulty === f.difficulty);
  if (f.period === 'last30') out = out.slice(-30);
  else if (f.period === 'last100') out = out.slice(-100);
  else if (f.period === 'season' && f.season) out = out.filter((m) => m.seasonId === f.season);
  return out;
}

// ---------------- 気づき（文章で教える） ----------------

export interface Insight {
  icon: string;
  text: string;
  tone: 'good' | 'bad' | 'info';
}

const MIN_GROUP = 5; // 内訳の比較に使う、最低の試合数
const r0 = (x: number) => Math.round(x);

export function insights(ms: AMatch[]): Insight[] {
  const out: Insight[] = [];
  if (ms.length < 5) return [{ icon: 'ℹ️', text: 'あと数戦、記録がたまると、得意・苦手などの気づきが出ます。', tone: 'info' }];

  const all = summarize(ms);

  // 連勝・連敗
  const st = streaks(ms);
  if (st.currentType === 'W' && st.current >= 3) out.push({ icon: '🔥', text: `いま ${st.current} 連勝中です（最高は ${st.bestWin} 連勝）`, tone: 'good' });
  if (st.currentType === 'L' && st.current >= 3) out.push({ icon: '🧊', text: `いま ${st.current} 連敗中です。少し休むか、得意な曲の相手を待つのも手です`, tone: 'bad' });

  // 直近と全体の比較
  if (ms.length >= 30) {
    const recent = summarize(ms.slice(-20));
    const diff = recent.winRate - all.winRate;
    if (diff >= 10) out.push({ icon: '📈', text: `直近20戦の勝率は ${r0(recent.winRate)}%（全体より +${r0(diff)}pt）。調子が上がっています`, tone: 'good' });
    else if (diff <= -10) out.push({ icon: '📉', text: `直近20戦の勝率は ${r0(recent.winRate)}%（全体より ${r0(diff)}pt）。やや苦戦しています`, tone: 'bad' });
  }

  // 得意・苦手なレベル帯
  const levels = byLevel(ms).filter((g) => g.total >= MIN_GROUP);
  if (levels.length >= 2) {
    const best = levels.reduce((a, b) => (b.winRate > a.winRate ? b : a));
    const worst = levels.reduce((a, b) => (b.winRate < a.winRate ? b : a));
    if (best.winRate - worst.winRate >= 15) {
      out.push({ icon: '💪', text: `${best.label} が得意です（勝率 ${r0(best.winRate)}%・${best.total}戦）`, tone: 'good' });
      out.push({ icon: '🎯', text: `${worst.label} は苦戦しています（勝率 ${r0(worst.winRate)}%・${worst.total}戦）。ここを伸ばすと、勝率が上がりそうです`, tone: 'bad' });
    }
  }

  // AP の効果
  const withAP = ms.filter((m) => m.ap);
  const withoutAP = ms.filter((m) => !m.ap);
  if (withAP.length >= 3 && withoutAP.length >= 3) {
    out.push({
      icon: '✨',
      text: `ALL PERFECT を出した試合の勝率は ${r0(pct(withAP.filter((m) => m.outcome === 'W').length, withAP.length))}%（出さなかった試合は ${r0(pct(withoutAP.filter((m) => m.outcome === 'W').length, withoutAP.length))}%）`,
      tone: 'info',
    });
  }

  // 格上
  const higher = ms.filter((m) => m.higher);
  if (higher.length >= 3) {
    const hs = summarize(higher);
    out.push({ icon: '🏔️', text: `格上の相手との勝率は ${r0(hs.winRate)}%（${hs.total}戦）`, tone: hs.winRate >= 50 ? 'good' : 'info' });
  }

  // 接戦
  const losses = ms.filter((m) => m.outcome === 'L');
  if (losses.length >= 5) {
    const closeLosses = losses.filter((m) => Math.abs(m.myScore - m.oppScore) <= 10).length;
    if (pct(closeLosses, losses.length) >= 40) {
      out.push({ icon: '🤏', text: `負けの ${r0(pct(closeLosses, losses.length))}% は、スコア差10以内の僅差です。BAD・MISS を1つ減らすだけで、勝てる試合が増えます`, tone: 'info' });
    }
  }

  // BAD・MISS の多さ
  const j = judgment(ms);
  const mine = j.me.bad + j.me.miss;
  const theirs = j.opp.bad + j.opp.miss;
  if (theirs > 0 && mine >= theirs * 1.5 && mine > 0.1) {
    out.push({ icon: '⚠️', text: `BAD・MISS の割合が、相手の平均より多めです（自分 ${mine.toFixed(2)}% / 相手 ${theirs.toFixed(2)}%）`, tone: 'bad' });
  }

  // 時間帯
  const hours = byHour(ms).filter((g) => g.total >= 10);
  if (hours.length >= 2) {
    const best = hours.reduce((a, b) => (b.winRate > a.winRate ? b : a));
    const worst = hours.reduce((a, b) => (b.winRate < a.winRate ? b : a));
    if (best.winRate - worst.winRate >= 20) out.push({ icon: '🕐', text: `${best.label} の勝率が高めです（${r0(best.winRate)}%）。${worst.label} は ${r0(worst.winRate)}%`, tone: 'info' });
  }

  return out.slice(0, 7);
}
