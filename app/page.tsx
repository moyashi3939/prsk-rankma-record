'use client';

import { useState } from 'react';

export default function Home() {
  const [showWelcome, setShowWelcome] = useState(true);

  const [seasonInfo, setSeasonInfo] = useState({
    name: 'Season 1',
    isMeasuring: true, // ランク計測中
    measuredMatches: 0,
    remainingDays: 80,
  });

  const [stats, setStats] = useState({
    winRate: 0,
    totalMatches: 0,
    recordsCount: 0,
    wins: 0,
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 relative">
      {/* 1. 上部カード群 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* シーズン・ランク計測状態カード (プロセカ風グラデーション) */}
        <div className="lg:col-span-2 bg-gradient-to-br from-[#1e2238] to-[#16192b] border border-slate-800 text-white rounded-3xl p-7 shadow-xl relative overflow-hidden flex flex-col justify-between h-52">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-pink-500/10 rounded-full blur-2xl pointer-events-none"></div>

          <div className="flex justify-between items-center z-10">
            <span className="bg-pink-500/20 border border-pink-500/30 text-pink-300 px-3.5 py-1 rounded-full text-xs font-semibold tracking-wide">
              {seasonInfo.name}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              シーズン終了まで あと {seasonInfo.remainingDays} 日
            </span>
          </div>

          <div className="z-10">
            <h2 className="text-3xl font-extrabold tracking-wide mb-1 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              {seasonInfo.isMeasuring ? 'ランク計測中' : 'ダイヤモンド クラス2'}
            </h2>
            <p className="text-sm text-cyan-400 font-medium">
              {seasonInfo.isMeasuring
                ? `残りランク決めマッチ：あと ${3 - seasonInfo.measuredMatches} 試合`
                : '3 粒 / 45 pt'}
            </p>
          </div>

          <div className="z-10">
            <div className="w-full bg-slate-900/80 rounded-full h-2.5 mb-2 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-pink-500 to-purple-500 h-2.5 rounded-full transition-all"
                style={{
                  width: seasonInfo.isMeasuring
                    ? `${(seasonInfo.measuredMatches / 3) * 100}%`
                    : '60%',
                }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>初期クラス決定戦</span>
              <span className="text-slate-200 font-semibold">
                {seasonInfo.isMeasuring
                  ? `${seasonInfo.measuredMatches} / 3 完了`
                  : 'クラス昇格まであと2勝'}
              </span>
            </div>
          </div>
        </div>

        {/* サマリーカード群 (勝率・試合数・記録数) */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#16192b] border border-slate-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between col-span-2">
            <span className="text-xs text-slate-400 font-medium">通算勝率</span>
            <div className="text-center my-2">
              <span className="text-4xl font-black text-cyan-400 tracking-tight">
                {stats.winRate}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 border-t pt-2.5 border-slate-800/80">
              <span>勝利数</span>
              <span className="font-bold text-slate-200">{stats.wins} 勝</span>
            </div>
          </div>

          <div className="bg-[#16192b] border border-slate-800 p-4 rounded-3xl shadow-xl flex flex-col justify-center">
            <span className="text-xs text-slate-400 block mb-1">総試合数</span>
            <span className="text-xl font-black text-slate-200">
              #{stats.totalMatches}
            </span>
          </div>

          <div className="bg-[#16192b] border border-slate-800 p-4 rounded-3xl shadow-xl flex flex-col justify-center">
            <span className="text-xs text-slate-400 block mb-1">記録データ</span>
            <span className="text-xl font-black text-slate-200">
              {stats.recordsCount} 件
            </span>
          </div>
        </div>
      </div>

      {/* 2. シーズン一覧・現在の調子 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#16192b] border border-slate-800 p-5 rounded-3xl shadow-xl flex items-center justify-between cursor-pointer hover:border-slate-700 transition group">
          <div className="flex items-center space-x-3.5">
            <div className="bg-pink-500/10 text-pink-400 p-3 rounded-2xl border border-pink-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-slate-200 block">シーズン一覧</span>
              <span className="text-xs text-slate-400">過去の戦績やシーズン切替</span>
            </div>
          </div>
          <span className="text-slate-500 group-hover:text-slate-300 transition">&gt;</span>
        </div>

        <div className="bg-[#16192b] border border-slate-800 p-5 rounded-3xl shadow-xl">
          <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center space-x-1.5">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 9 0 0118 0z" />
            </svg>
            <span>現在のコンディション（直近の調子）</span>
          </h3>
          <p className="text-xs text-slate-500 mt-3">まだ対戦データが記録されていません</p>
        </div>
      </div>

      {/* 3. 直近の対戦 */}
      <div className="bg-[#16192b] border border-slate-800 p-6 rounded-3xl shadow-xl">
        <h3 className="font-bold text-slate-200 mb-4 flex items-center justify-between">
          <span>直近の対戦履歴</span>
          <span className="text-xs text-slate-500 font-normal">最新5件</span>
        </h3>
        <div className="border-2 border-dashed border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm">
          まだ戦績の記録がありません。「+ 新規記録」から最初の試合を登録してみましょう！
        </div>
      </div>

      {/* 4. 初めてのアクセス（ウェルカムモーダル） */}
      {showWelcome && (
        <div className="fixed inset-0 bg-[#0f111a]/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#16192b] border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent mb-1">
                ランクマレコードへようこそ！
              </h2>
              <p className="text-xs text-slate-400">プロセカ ランクマッチ専用トラッカー</p>
            </div>

            <div className="space-y-4 text-left text-sm">
              <div className="flex items-start space-x-4 bg-slate-900/50 p-3.5 rounded-2xl border border-slate-800">
                <div className="bg-pink-500/20 text-pink-400 p-2.5 rounded-xl shrink-0 font-bold">1</div>
                <div>
                  <h4 className="font-bold text-slate-200">シーズンと現在のランクを設定</h4>
                  <p className="text-xs text-slate-400 mt-0.5">現在のクラスやシーズン情報を確認・準備します。</p>
                </div>
              </div>

              <div className="flex items-start space-x-4 bg-slate-900/50 p-3.5 rounded-2xl border border-slate-800">
                <div className="bg-purple-500/20 text-purple-400 p-2.5 rounded-xl shrink-0 font-bold">2</div>
                <div>
                  <h4 className="font-bold text-slate-200">試合結果を簡単記録</h4>
                  <p className="text-xs text-slate-400 mt-0.5">勝敗やボーナスを選ぶだけで、粒やポイントが自動計算されます。</p>
                </div>
              </div>

              <div className="flex items-start space-x-4 bg-slate-900/50 p-3.5 rounded-2xl border border-slate-800">
                <div className="bg-cyan-500/20 text-cyan-400 p-2.5 rounded-xl shrink-0 font-bold">3</div>
                <div>
                  <h4 className="font-bold text-slate-200">戦績を深く分析</h4>
                  <p className="text-xs text-slate-400 mt-0.5">勝率や得意曲の傾向を把握して、マスターランクを目指しましょう。</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowWelcome(false)}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3.5 rounded-2xl transition shadow-lg shadow-pink-600/25"
            >
              はじめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}