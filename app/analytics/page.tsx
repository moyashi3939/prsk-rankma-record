'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  applyFilter,
  byDifficulty,
  byHour,
  byLevel,
  byWeekday,
  closeGames,
  insights,
  judgment,
  rolling,
  songStats,
  streaks,
  summarize,
  type AMatch,
  type Filter,
  type Group,
  type SongStat,
} from '@/lib/analytics';
import { RANKS } from '@/lib/rank';
import { BarRows, Dots, LineChart, StackedBar } from '@/components/charts';

interface RankPoint {
  id: number;
  points: number | null;
  rank: string;
  classIndex: number;
  grains: number;
  bonus: number;
}

interface AnalyticsData {
  matches: AMatch[];
  rankProgress: RankPoint[] | null;
  rankStart: number | null;
  seasons: string[];
  currentSeason: string | null;
}

const WINDOW = 10; // 勝率・精度の推移を、直近何戦ぶんで計算するか
const MIN_SONG_GAMES = 2; // 得意・課題の曲に出すのに必要な、最低の試合数

const JUDGE_COLORS = { perf: '#f472b6', great: '#fbbf24', good: '#34d399', bad: '#60a5fa', miss: '#94a3b8' } as const;
const JUDGE_LABELS = { perf: 'PERFECT', great: 'GREAT', good: 'GOOD', bad: 'BAD', miss: 'MISS' } as const;

const Panel = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="glass-panel p-5 md:p-6 rounded-3xl border border-white/10 space-y-3">
    <div>
      <h2 className="font-bold text-sm text-white">{title}</h2>
      {hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

const Kpi = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) => (
  <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
    <p className="text-[10px] font-bold text-slate-400">{label}</p>
    <p className={`text-2xl md:text-3xl font-black font-mono mt-1 ${accent ?? 'text-white'}`}>{value}</p>
    {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
  </div>
);

const pctText = (v: number, digits = 0) => `${v.toFixed(digits)}%`;

// 勝率の高い・低いレベル帯などに、目印をつける（試合数が少ないものは、比べない）
function withHighlight(groups: Group[], minGames = 5) {
  const comparable = groups.filter((g) => g.total >= minGames);
  const best = comparable.length >= 2 ? comparable.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : null;
  const worst = comparable.length >= 2 ? comparable.reduce((a, b) => (b.winRate < a.winRate ? b : a)) : null;
  return groups.map((g) => ({
    key: g.key,
    label: g.label,
    value: g.winRate,
    sub: `${pctText(g.winRate)}（${g.wins}勝/${g.total}戦）精度 ${pctText(g.accuracy, 1)}`,
    highlight: best && worst && best.winRate - worst.winRate >= 15 ? (g.key === best.key ? ('good' as const) : g.key === worst.key ? ('bad' as const) : undefined) : undefined,
  }));
}

const songRows = (list: SongStat[]) =>
  list.map((s) => ({
    key: s.key,
    label: `${s.name}（${s.difficulty}${s.level !== null ? ` Lv.${s.level}` : ''}）`,
    value: s.winRate,
    sub: `${pctText(s.winRate)}（${s.wins}勝/${s.total}戦）`,
  }));

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>({ period: 'all', season: null, difficulty: 'all' });

  useEffect(() => {
    fetch('/api/analytics', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData(await res.json());
      })
      .catch((err) => {
        console.error('分析データの取得に失敗:', err);
        setError('分析データを取得できませんでした。');
      });
  }, []);

  const filtered = useMemo(() => (data ? applyFilter(data.matches, filter) : []), [data, filter]);
  const difficulties = useMemo(() => (data ? Array.from(new Set(data.matches.map((m) => m.difficulty))) : []), [data]);

  const stats = useMemo(() => {
    const summary = summarize(filtered);
    const roll = rolling(filtered, WINDOW);
    const songs = songStats(filtered).filter((s) => s.total >= MIN_SONG_GAMES);
    return {
      summary,
      streak: streaks(filtered),
      roll,
      levels: byLevel(filtered),
      diffs: byDifficulty(filtered),
      hours: byHour(filtered),
      weekdays: byWeekday(filtered),
      judge: judgment(filtered),
      close: closeGames(filtered),
      tips: insights(filtered),
      strong: songs.filter((s) => s.winRate >= 50).sort((a, b) => b.winRate - a.winRate || b.total - a.total).slice(0, 5),
      weak: songs.filter((s) => s.winRate < 50).sort((a, b) => a.winRate - b.winRate || b.total - a.total).slice(0, 5),
      played: songStats(filtered).sort((a, b) => b.total - a.total).slice(0, 5),
    };
  }, [filtered]);

  // ランクの推移（期間の絞り込みだけ反映する）
  const rankChart = useMemo(() => {
    if (!data?.rankProgress) return null;
    let points = data.rankProgress;
    if (filter.period === 'last30') points = points.slice(-30);
    else if (filter.period === 'last100') points = points.slice(-100);
    const values = points.map((p) => p.points);
    const nums = values.filter((v): v is number => v !== null);
    if (nums.length < 2) return null;

    const lo = Math.floor(Math.min(...nums) / 20) * 20;
    const hi = Math.ceil(Math.max(...nums) / 20) * 20;
    const step = Math.max(20, Math.ceil((hi - lo) / 5 / 20) * 20);
    const ticks: { value: number; label: string }[] = [];
    for (let v = lo; v <= hi; v += step) ticks.push({ value: v, label: RANKS[Math.min(RANKS.length - 1, v / 20)] ?? '' });
    const last = points[points.length - 1];
    return { values, ticks, last, gained: nums[nums.length - 1] - nums[0] };
  }, [data, filter.period]);

  if (error) {
    return <p className="text-center text-sm text-pink-300 py-20">{error}</p>;
  }
  if (!data) {
    return <p className="text-center text-sm text-slate-400 py-20">読み込み中...</p>;
  }
  if (data.matches.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 space-y-4">
        <p className="text-4xl">📊</p>
        <p className="text-sm text-slate-300">まだ対戦記録がありません。記録がたまると、勝率の推移や得意・苦手が、ここに出ます。</p>
        <Link href="/" className="inline-block bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition">
          ホームで記録する
        </Link>
      </div>
    );
  }

  const { summary, streak, roll, judge } = stats;
  const form = filtered.slice(-20).map((m) => m.outcome);
  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-[11px] font-bold transition border ${active ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`;

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-6 text-white">
      {/* ヘッダー・絞り込み */}
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent">📊 プレイ分析</h1>
          <p className="text-[11px] text-slate-400 mt-1">対戦記録から、調子の移り変わり・得意と苦手・勝ち負けのくせを、まとめます。</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {([['all', '全期間'], ['last30', '直近30戦'], ['last100', '直近100戦']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter({ ...filter, period: k })} className={chip(filter.period === k)}>
              {label}
            </button>
          ))}
          {data.seasons.length >= 2 && (
            <select
              value={filter.period === 'season' ? filter.season ?? '' : ''}
              onChange={(e) => setFilter(e.target.value ? { ...filter, period: 'season', season: e.target.value } : { ...filter, period: 'all', season: null })}
              className="bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-[11px] font-bold outline-none"
            >
              <option value="">シーズンで絞る</option>
              {data.seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFilter({ ...filter, difficulty: 'all' })} className={chip(filter.difficulty === 'all')}>
            難易度：すべて
          </button>
          {difficulties.map((d) => (
            <button key={d} type="button" onClick={() => setFilter({ ...filter, difficulty: d })} className={chip(filter.difficulty === d)}>
              {d}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">いま {filtered.length} 戦を集計しています（全部で {data.matches.length} 戦）</p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-16">この条件に当てはまる対戦がありません。</p>
      ) : (
        <>
          {/* 数字のまとめ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="勝率" value={pctText(summary.winRate, 1)} sub={`${summary.wins}勝 ${summary.losses}敗 ${summary.draws}分（${summary.total}戦）`} accent="text-cyan-300" />
            <Kpi
              label={streak.currentType === 'L' ? '現在の連敗' : '現在の連勝'}
              value={`${streak.current}`}
              sub={`最高 ${streak.bestWin}連勝 ／ 最多 ${streak.bestLose}連敗`}
              accent={streak.currentType === 'L' ? 'text-pink-300' : 'text-amber-300'}
            />
            <Kpi label="精度（満点に対する割合）" value={pctText(summary.accuracy, 2)} sub="相手に関係なく、プレイの出来を表します" accent="text-emerald-300" />
            <Kpi label="平均スコア差" value={`${summary.avgScoreDiff >= 0 ? '+' : ''}${summary.avgScoreDiff.toFixed(1)}`} sub="自分 − 相手" />
            <Kpi label="ALL PERFECT" value={`${summary.apCount}回`} sub={`${pctText(summary.apRate, 1)} の試合`} accent="text-pink-300" />
            <Kpi label="FULL COMBO" value={`${summary.fcCount}回`} sub={`${pctText(summary.fcRate, 1)} の試合（APを除く）`} />
            <Kpi label="ライフ0" value={`${summary.life0Count}回`} sub="ライフが0になった試合" />
            <Kpi
              label="接戦（スコア差10以内）"
              value={stats.close.total > 0 ? pctText(stats.close.winRate) : '—'}
              sub={stats.close.total > 0 ? `${stats.close.wins}勝 ${stats.close.losses}敗` : '接戦はまだありません'}
            />
          </div>

          {/* 気づき */}
          <Panel title="💡 気づき" hint="記録から、自動で見つけたことです">
            <ul className="space-y-2">
              {stats.tips.map((t, i) => (
                <li
                  key={i}
                  className={`flex gap-2 text-xs leading-relaxed rounded-xl px-3 py-2 border ${
                    t.tone === 'good' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-100' : t.tone === 'bad' ? 'bg-pink-500/10 border-pink-500/30 text-pink-100' : 'bg-white/5 border-white/10 text-slate-200'
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* 調子の推移 */}
          <Panel title="📈 勝率の推移" hint={`直近${WINDOW}戦ごとの勝率（点線は、全体の勝率）`}>
            <LineChart
              series={[{ name: '勝率', color: '#22d3ee', values: roll.map((r) => r.winRate) }]}
              yMin={0}
              yMax={100}
              yFormat={(v) => `${Math.round(v)}%`}
              refLine={{ value: summary.winRate, label: `全体 ${Math.round(summary.winRate)}%` }}
            />
            <div className="pt-1 space-y-1">
              <p className="text-[10px] text-slate-500">直近{form.length}戦（左が古く、右が新しい）</p>
              <Dots outcomes={form} />
            </div>
          </Panel>

          <Panel title="🎯 精度の推移" hint={`直近${WINDOW}戦ごとの精度（スコアが満点の何%か）。勝ち負けではなく、プレイの上達を見ます`}>
            <LineChart
              series={[{ name: '精度', color: '#34d399', values: roll.map((r) => r.accuracy) }]}
              yFormat={(v) => `${v.toFixed(1)}%`}
              refLine={{ value: summary.accuracy, label: `全体 ${summary.accuracy.toFixed(1)}%` }}
            />
          </Panel>

          {/* ランクの推移 */}
          <Panel title="🏅 ランクの推移" hint="ランクポイント（粒とボーナス）の積み上がりです。縦軸は、ランクの境目">
            {rankChart ? (
              <>
                <LineChart series={[{ name: 'ランクポイント', color: '#f472b6', values: rankChart.values }]} ticks={rankChart.ticks} />
                <p className="text-[11px] text-slate-300">
                  いま：<b>{rankChart.last.rank}{rankChart.last.rank === 'マスター' ? '' : ` クラス${rankChart.last.classIndex + 1}`} {rankChart.last.grains}粒</b>
                  （ボーナス {rankChart.last.bonus}）／ この期間の増減：
                  <b className={rankChart.gained >= 0 ? 'text-cyan-300' : 'text-pink-300'}>
                    {' '}
                    {rankChart.gained >= 0 ? '+' : ''}
                    {rankChart.gained} 粒
                  </b>
                </p>
              </>
            ) : (
              <p className="text-[11px] text-slate-500">
                ランクの推移は、ホーム画面の「ランク・粒を修正」で、いまの状態を設定したあとの対戦から、表示できます（この記録では、まだ表示できません）。
              </p>
            )}
          </Panel>

          {/* レベル・難易度 */}
          <div className="grid md:grid-cols-2 gap-5">
            <Panel title="🎼 レベル帯別の成績" hint="試合数が5戦以上あるレベル帯で、得意（👍）と苦手（🎯）を比べます">
              {stats.levels.length === 0 ? <p className="text-[11px] text-slate-500">レベルのデータがありません</p> : <BarRows rows={withHighlight(stats.levels)} />}
            </Panel>
            <Panel title="⚔️ 難易度別の成績">
              <BarRows rows={withHighlight(stats.diffs)} color="#a78bfa" />
            </Panel>
          </div>

          {/* 判定 */}
          <Panel title="🎹 判定の内訳" hint="総ノーツ数に対する、各判定の割合です（自分と相手の平均）">
            <div className="space-y-3">
              {([['自分', judge.me], ['相手', judge.opp]] as const).map(([who, j]) => (
                <div key={who} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-bold text-slate-200">{who}</span>
                    <span className="text-slate-400 font-mono">
                      PERFECT {j.perf.toFixed(2)}% ／ BAD+MISS {(j.bad + j.miss).toFixed(2)}%
                    </span>
                  </div>
                  <StackedBar segments={(Object.keys(JUDGE_COLORS) as (keyof typeof JUDGE_COLORS)[]).map((k) => ({ label: JUDGE_LABELS[k], value: j[k], color: JUDGE_COLORS[k] }))} />
                </div>
              ))}
              <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
                {(Object.keys(JUDGE_COLORS) as (keyof typeof JUDGE_COLORS)[]).map((k) => (
                  <span key={k} className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: JUDGE_COLORS[k] }} />
                    {JUDGE_LABELS[k]}
                  </span>
                ))}
              </div>
            </div>
          </Panel>

          {/* 曲 */}
          <div className="grid md:grid-cols-2 gap-5">
            <Panel title="👍 得意な曲" hint={`${MIN_SONG_GAMES}戦以上遊んだ曲の、勝率が高い順`}>
              {stats.strong.length === 0 ? <p className="text-[11px] text-slate-500">まだありません</p> : <BarRows rows={songRows(stats.strong)} />}
            </Panel>
            <Panel title="🎯 課題の曲" hint={`${MIN_SONG_GAMES}戦以上遊んだ曲の、勝率が低い順。ここを練習すると伸びます`}>
              {stats.weak.length === 0 ? (
                <p className="text-[11px] text-slate-500">勝率50%未満の曲は、ありません</p>
              ) : (
                <BarRows rows={songRows(stats.weak).map((r) => ({ ...r, highlight: 'bad' as const }))} />
              )}
            </Panel>
          </div>
          <Panel title="🎧 よく遊んだ曲">
            <ul className="space-y-1.5">
              {stats.played.map((s, i) => (
                <li key={s.key} className="flex justify-between gap-3 text-[11px]">
                  <span className="text-slate-200 truncate">
                    {i + 1}. {s.name}（{s.difficulty}
                    {s.level !== null ? ` Lv.${s.level}` : ''}）
                  </span>
                  <span className="text-slate-400 font-mono shrink-0">
                    {s.total}戦 ／ 勝率 {pctText(s.winRate)} ／ BAD+MISS 平均 {s.badMiss.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* 時間帯・曜日 */}
          {(stats.hours.length > 0 || stats.weekdays.length > 0) && (
            <div className="grid md:grid-cols-2 gap-5">
              <Panel title="🕐 時間帯別の勝率" hint="記録した時間帯ごと">
                <BarRows rows={stats.hours.map((g) => ({ key: g.key, label: g.label, value: g.winRate, sub: `${pctText(g.winRate)}（${g.total}戦）` }))} color="#fbbf24" />
              </Panel>
              <Panel title="📅 曜日別の勝率">
                <BarRows rows={stats.weekdays.map((g) => ({ key: g.key, label: g.label, value: g.winRate, sub: `${pctText(g.winRate)}（${g.total}戦）` }))} color="#fb923c" />
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  );
}
