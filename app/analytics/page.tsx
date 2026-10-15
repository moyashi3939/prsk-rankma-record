'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error('分析データ取得失敗:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080910] text-cyan-400 flex items-center justify-center font-mono text-sm tracking-widest animate-pulse">
        [ NEURAL SYSTEM INITIALIZING... ANALYZING BATTLE DATA ]
      </div>
    );
  }

  const { summary, timeline, songAnalysis } = data || {};

  return (
    <div className="min-h-screen bg-[#080910] text-white p-6 md:p-12 space-y-10 font-sans selection:bg-pink-500 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* ヘッダー */}
        <div className="flex justify-between items-center border-b border-white/10 pb-6">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase">Neural Analyzer v2.6</span>
            </div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
              ⚡ 戦闘データ・ニューラル分析
            </h1>
          </div>
          <Link
            href="/"
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-bold py-2.5 px-5 rounded-2xl text-xs transition backdrop-blur-md"
          >
            ← ホームに戻る
          </Link>
        </div>

        {summary.total === 0 ? (
          <div className="glass-panel p-16 rounded-3xl border border-white/10 text-center space-y-4">
            <p className="text-slate-400 text-sm">分析対象となる対戦レコードがまだ存在しません。</p>
            <p className="text-xs text-slate-500">まずはホーム画面から試合結果を登録してみましょう！</p>
          </div>
        ) : (
          <>
            {/* メイン・ステータスカード群 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* 総合戦闘力 (Neural Index) */}
              <div className="glass-panel p-6 rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/20 to-transparent relative overflow-hidden space-y-2">
                <div className="absolute top-0 right-0 p-4 text-cyan-400/20 text-4xl font-black font-mono">01</div>
                <p className="text-xs text-slate-400 font-mono tracking-wider">NEURAL INDEX</p>
                <p className="text-4xl font-black text-cyan-300 font-mono">{summary.neuralIndex}</p>
                <p className="text-[10px] text-cyan-400/80">総合プレイング戦闘力</p>
              </div>

              {/* 勝率 */}
              <div className="glass-panel p-6 rounded-3xl border border-pink-500/30 bg-gradient-to-br from-pink-950/20 to-transparent relative overflow-hidden space-y-2">
                <div className="absolute top-0 right-0 p-4 text-pink-400/20 text-4xl font-black font-mono">02</div>
                <p className="text-xs text-slate-400 font-mono tracking-wider">WIN RATE</p>
                <p className="text-4xl font-black text-pink-400 font-mono">{summary.winRate}%</p>
                <p className="text-[10px] text-slate-400">{summary.wins}勝 / 全{summary.total}試合</p>
              </div>

              {/* FC率 */}
              <div className="glass-panel p-6 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-transparent relative overflow-hidden space-y-2">
                <div className="absolute top-0 right-0 p-4 text-amber-400/20 text-4xl font-black font-mono">03</div>
                <p className="text-xs text-slate-400 font-mono tracking-wider">FULL COMBO RATE</p>
                <p className="text-4xl font-black text-amber-300 font-mono">{summary.fcRate}%</p>
                <p className="text-[10px] text-slate-400">フルコンボ達成率</p>
              </div>

              {/* AP率 */}
              <div className="glass-panel p-6 rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/20 to-transparent relative overflow-hidden space-y-2">
                <div className="absolute top-0 right-0 p-4 text-purple-400/20 text-4xl font-black font-mono">04</div>
                <p className="text-xs text-slate-400 font-mono tracking-wider">ALL PERFECT RATE</p>
                <p className="text-4xl font-black text-purple-300 font-mono">{summary.apRate}%</p>
                <p className="text-[10px] text-slate-400">オールパーフェクト達成率</p>
              </div>
            </div>

            {/* スコア差・バイオリズム変動ウェーブ */}
            <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center space-x-2">
                    <span>📈 バイオリズム・スコア差ウェーブ</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">対戦相手とのスコア差の時系列変動（上：勝利優勢 / 下：敗北劣勢）</p>
                </div>
                <div className="text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1 rounded-xl">
                  平均スコア差: {summary.avgScoreDiff > 0 ? `+${summary.avgScoreDiff}` : summary.avgScoreDiff} pt
                </div>
              </div>

              {/* カスタムビジュアル・タイムライン */}
              <div className="h-40 bg-slate-950/60 rounded-2xl border border-white/5 p-4 flex items-end gap-2 overflow-x-auto">
                {timeline.map((t: any) => {
                  const isWin = t.result === 'WIN';
                  // 高さをスコア差に応じて計算（最大高さに収める）
                  const heightPercent = Math.min(Math.max(Math.abs(t.scoreDiff) / 50, 10), 100);
                  
                  return (
                    <div key={t.id} className="flex-1 flex flex-col items-center min-w-[24px] group relative">
                      {/* ツールチップ */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-slate-900 border border-white/20 p-2 rounded-xl text-[10px] z-20 whitespace-nowrap shadow-2xl">
                        <span className="font-bold text-white">#{t.index} {t.songName}</span>
                        <span className={isWin ? 'text-cyan-400 font-bold' : 'text-pink-400 font-bold'}>{t.result} (差: {t.scoreDiff > 0 ? `+${t.scoreDiff}` : t.scoreDiff}pt)</span>
                        <span className="text-slate-400">{t.difficulty} / Lv.{t.level}</span>
                      </div>

                      {/* バー本体 */}
                      <div
                        className={`w-full rounded-t-lg transition-all duration-300 group-hover:brightness-125 ${
                          isWin ? 'bg-gradient-to-t from-cyan-900 to-cyan-400' : 'bg-gradient-to-t from-pink-900 to-pink-500'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      ></div>
                      <span className="text-[9px] font-mono text-slate-600 mt-1">#{t.index}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 得意・苦手楽曲マトリクス */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 得意楽曲（勝率上位） */}
              <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-black text-sm text-cyan-300 flex items-center space-x-2">
                    <span>👑 得意楽曲マトリクス (勝率HIGH)</span>
                  </h3>
                  <span className="text-xs text-slate-500">Top Rated</span>
                </div>
                <div className="space-y-3">
                  {songAnalysis.slice(0, 5).map((song: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-900/40 p-3 rounded-2xl border border-white/5">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-white">{song.name}</p>
                        <p className="text-[10px] text-slate-400">{song.total}戦 {song.wins}勝 / 平均スコア: {song.avgScore}pt</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-cyan-400 font-mono">{song.winRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 課題楽曲（勝率下位・要特訓） */}
              <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-black text-sm text-pink-400 flex items-center space-x-2">
                    <span>🔥 課題楽曲マトリクス (要特訓)</span>
                  </h3>
                  <span className="text-xs text-slate-500">Needs Focus</span>
                </div>
                <div className="space-y-3">
                  {[...songAnalysis].reverse().slice(0, 5).map((song: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-900/40 p-3 rounded-2xl border border-white/5">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-white">{song.name}</p>
                        <p className="text-[10px] text-slate-400">{song.total}戦 {song.wins}勝 / 平均スコア: {song.avgScore}pt</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-pink-400 font-mono">{song.winRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}