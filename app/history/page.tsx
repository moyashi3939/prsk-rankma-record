// app/history/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function HistoryPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMatches(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('データ取得失敗:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#080910] text-white p-6 md:p-12 space-y-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ヘッダー部分 */}
        <div className="flex justify-between items-center border-b border-white/10 pb-4">
          <div>
            <h1 className="text-2xl font-black bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent">
              📜 対戦履歴一覧
            </h1>
            <p className="text-xs text-slate-400 mt-1">これまでのランクマッチの戦績ログ</p>
          </div>
          <Link
            href="/"
            className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-xl text-xs transition"
          >
            ← ホームに戻る
          </Link>
        </div>

        {/* 履歴リスト */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">読み込み中...</div>
          ) : matches.length === 0 ? (
            <div className="glass-panel p-12 rounded-3xl border border-white/10 text-center space-y-3">
              <p className="text-slate-400 text-sm">まだ対戦レコードが登録されていません。</p>
              <p className="text-xs text-slate-500">ホーム画面の「新規記録」から最初の戦績を登録してみましょう！</p>
            </div>
          ) : (
            matches.map((match: any) => {
              const isWin = match.result === 'WIN';
              const isLose = match.result === 'LOSE';

              return (
                <div
                  key={match.id}
                  className={`glass-panel p-5 rounded-2xl border transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                    isWin
                      ? 'border-cyan-500/30 bg-cyan-950/10'
                      : isLose
                      ? 'border-pink-500/30 bg-pink-950/10'
                      : 'border-white/10 bg-slate-900/40'
                  }`}
                >
                  {/* 曲情報・難易度 */}
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-xs font-black px-2.5 py-0.5 rounded-lg ${
                          isWin
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : isLose
                            ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {match.result}
                      </span>
                      {match.is_opponent_higher && (
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-md">
                          🔥格上
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-mono">
                        {new Date(match.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-white">{match.song_name}</h3>
                    <div className="flex items-center space-x-2 text-xs text-slate-300">
                      <span className="text-pink-400 font-bold">{match.difficulty}</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-cyan-300 font-semibold">Lv.{match.level}</span>
                    </div>
                  </div>

                  {/* スコア・判定サマリー */}
                  <div className="flex items-center space-x-6 text-xs font-mono">
                    <div className="text-right">
                      <p className="text-slate-400 text-[10px]">自分スコア</p>
                      <p className="text-cyan-300 font-bold text-sm">{match.my_score} pt</p>
                    </div>
                    <div className="text-slate-600 font-bold">VS</div>
                    <div className="text-right">
                      <p className="text-slate-400 text-[10px]">相手スコア</p>
                      <p className="text-pink-400 font-bold text-sm">{match.opp_score} pt</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}