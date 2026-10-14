'use client';

import { useState } from 'react';
import RecordModal from '@/components/RecordModal';

const CLASSES = [
  'クラス 1',
  'クラス 2',
  'クラス 3',
  'クラス 4',
];

export default function Home() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [showRecordModal, setShowRecordModal] = useState(false);

  const [currentRankData, setCurrentRankData] = useState({
    rankName: 'ダイヤモンド',
    classIndex: 0,
    grains: 3,
    season: 'Season 1',
    remainingDays: 80,
  });

  const [stats, setStats] = useState({
    wins: 0,
    losses: 0,
    draws: 0,
    totalMatches: 0,
  });

  const [matchLogs, setMatchLogs] = useState<any[]>([]);

  const handleRecordSubmit = (recordData: any) => {
    const { result, isBothAP } = recordData;

    let newGrains = currentRankData.grains;
    let newClassIndex = currentRankData.classIndex;
    let actualResult = result;

    if (result === 'DRAW' && isBothAP) {
      actualResult = 'WIN (AP DRAW)';
    }

    if (actualResult === 'WIN' || actualResult === 'WIN (AP DRAW)') {
      newGrains += 1;
      if (newGrains >= 6) {
        if (newClassIndex < CLASSES.length - 1) {
          newClassIndex += 1;
          newGrains = 1;
        } else {
          newGrains = 5;
        }
      }
    } else if (result === 'LOSE') {
      newGrains -= 1;
      if (newGrains < 0) {
        if (newClassIndex > 0) {
          newClassIndex -= 1;
          newGrains = 4;
        } else {
          newGrains = 0;
        }
      }
    }

    setCurrentRankData((prev) => ({
      ...prev,
      classIndex: newClassIndex,
      grains: newGrains,
    }));

    setStats((prev) => {
      const wins = prev.wins + (actualResult.includes('WIN') ? 1 : 0);
      const losses = prev.losses + (result === 'LOSE' ? 1 : 0);
      const draws = prev.draws + (result === 'DRAW' && !isBothAP ? 1 : 0);
      const totalMatches = prev.totalMatches + 1;
      return { wins, losses, draws, totalMatches };
    });

    setMatchLogs((prev) => [
      { ...recordData, result: actualResult, id: Date.now() },
      ...prev,
    ]);
  };

  const winRate = stats.totalMatches > 0 ? ((stats.wins / stats.totalMatches) * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen bg-[#080910] text-white selection:bg-pink-500 selection:text-white pb-16 pt-8 px-6">
      {/* メインコンテンツエリア（ヘッダーなしですっきり表示） */}
      <main className="max-w-6xl mx-auto space-y-8">
        {/* 1. メインステージ・カード */}
        <div className="glass-panel rounded-3xl p-8 relative overflow-hidden neon-glow-pink border border-white/10">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-gradient-to-br from-pink-500/20 to-cyan-500/20 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
            <div>
              <div className="flex items-center space-x-3 mb-3">
                <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
                  {currentRankData.season}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  シーズン終了まで あと <span className="text-cyan-400 font-bold">{currentRankData.remainingDays}日</span>
                </span>
              </div>

              <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2 flex items-baseline space-x-3">
                <span>{currentRankData.rankName}</span>
                <span className="text-2xl text-cyan-400 font-bold">{CLASSES[currentRankData.classIndex]}</span>
              </h2>
              <p className="text-xs text-slate-400">
                5粒満タンからさらに1勝（6粒目）で昇格！ 次のクラスを目指そう
              </p>
            </div>

            {/* 5粒インジケーター */}
            <div className="bg-slate-900/80 border border-white/10 p-5 rounded-2xl flex flex-col items-center min-w-[240px]">
              <span className="text-[11px] text-slate-400 mb-2 font-semibold uppercase tracking-wider">
                現在のランク粒
              </span>
              <div className="flex space-x-2 mb-3">
                {[1, 2, 3, 4, 5].map((num) => (
                  <div
                    key={num}
                    className={`w-7 h-9 rounded-lg border flex items-center justify-center transition-all ${
                      num <= currentRankData.grains
                        ? 'bg-gradient-to-t from-pink-600 to-cyan-400 border-white/40 shadow-[0_0_12px_rgba(6,182,212,0.5)] scale-105'
                        : 'bg-slate-800/80 border-slate-700/50'
                    }`}
                  >
                    <span className={`text-xs font-bold ${num <= currentRankData.grains ? 'text-white' : 'text-slate-600'}`}>
                      {num}
                    </span>
                  </div>
                ))}
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-white/5">
                <div
                  className="bg-gradient-to-r from-cyan-400 to-pink-500 h-full transition-all duration-500"
                  style={{ width: `${(Math.min(currentRankData.grains, 5) / 5) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between w-full text-[10px] text-slate-400 mt-1.5 font-mono">
                <span>PROGRESS</span>
                <span className="text-cyan-300 font-bold">{currentRankData.grains} / 5 粒 {currentRankData.grains === 5 && '(あと1勝で昇格)'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. スタッツ＆分析概要 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div className="glass-panel p-6 rounded-3xl md:col-span-2 flex flex-col justify-between border border-white/15">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">通算勝率 (WIN RATE)</span>
            <div className="flex items-baseline space-x-4 my-4">
              <span className="text-5xl font-black text-cyan-400 tracking-tighter">
                {winRate}%
              </span>
              <span className="text-sm text-slate-400">
                ({stats.wins}勝 / {stats.losses}敗 / {stats.draws}分)
              </span>
            </div>
            <div className="w-full bg-slate-800/80 h-2.5 rounded-full overflow-hidden border border-white/5">
              <div className="bg-gradient-to-r from-cyan-400 to-pink-500 h-full" style={{ width: `${winRate}%` }}></div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between border border-white/15">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">総対戦試合数</span>
            <div className="my-3">
              <span className="text-3xl font-black text-white">#{stats.totalMatches}</span>
            </div>
            <span className="text-[11px] text-slate-500">これまでのトータルマッチ</span>
          </div>

          <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between border border-white/15">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">コンディション</span>
            <div className="my-3">
              <span className="text-sm font-bold text-pink-400">
                {stats.totalMatches > 0 ? '対戦データ蓄積中' : '計測データ収集中'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">直近の連勝・連敗傾向</span>
          </div>
        </div>

        {/* 3. 直近の対戦フィード */}
        <div className="glass-panel p-8 rounded-3xl space-y-6 border border-white/15">
          <div className="flex justify-between items-center">
            <h3 className="font-extrabold text-lg text-white tracking-wide">直近の対戦ログ</h3>
            <button
              onClick={() => setShowRecordModal(true)}
              className="bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-bold py-2 px-5 rounded-xl shadow-lg shadow-pink-600/20 text-xs transition transform hover:scale-105"
            >
              + 試合を記録する
            </button>
          </div>

          {matchLogs.length === 0 ? (
            <div className="border border-dashed border-white/10 rounded-2xl p-12 text-center text-slate-500 text-sm">
              まだ対戦記録がありません。「+ 試合を記録する」から最初のスコアを刻みましょう！
            </div>
          ) : (
            <div className="space-y-3">
              {matchLogs.map((log) => {
                const scoreDiff = log.myScore - log.oppScore;
                const diffText = scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`;

                return (
                  <div key={log.id} className="bg-slate-900/60 border border-white/10 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-black tracking-wider shrink-0 ${
                          log.result.includes('WIN')
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : log.result === 'LOSE'
                            ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {log.result}
                      </span>
                      <div>
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <h4 className="font-bold text-white text-sm">{log.songName || '無題の曲'}</h4>
                          <span className="text-xs text-slate-400">({log.difficulty} Lv.{log.level})</span>
                          {log.myIsAP && <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[9px] font-black px-1.5 py-0.5 rounded">AP</span>}
                          {log.myIsFC && <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[9px] font-black px-1.5 py-0.5 rounded">FC</span>}
                          {log.isOpponentHigher && <span className="bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[9px] font-black px-1.5 py-0.5 rounded">🔥 格上</span>}
                          {log.isLifeZero && <span className="bg-red-500/20 text-red-300 border border-red-500/40 text-[9px] font-black px-1.5 py-0.5 rounded">❤️ ライフ0耐え</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 font-mono">
                          自分: <span className="text-cyan-300 font-bold">{log.myScore} pt</span> vs 相手: <span className="text-pink-300 font-bold">{log.oppScore} pt</span>
                        </p>
                      </div>
                    </div>

                    {/* 点差表示 */}
                    <div className="flex items-center space-x-2 self-end md:self-auto bg-slate-950/60 px-3 py-1.5 rounded-xl border border-white/5 font-mono">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">点差:</span>
                      <span
                        className={`text-xs font-black ${
                          scoreDiff > 0
                            ? 'text-emerald-400'
                            : scoreDiff < 0
                            ? 'text-rose-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {diffText} pt
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* 新規記録モーダル */}
      <RecordModal
        isOpen={showRecordModal}
        onClose={() => setShowRecordModal(false)}
        onSubmit={handleRecordSubmit}
      />

      {/* 初回ウェルカムモーダル（機能説明を復活） */}
      {showWelcome && (
        <div className="fixed inset-0 bg-[#080910]/85 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="glass-panel border border-white/15 rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center space-y-6 neon-glow-cyan relative overflow-hidden">
            <div className="absolute -left-20 -top-20 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>

            <div>
              <h2 className="text-2xl md:text-3xl font-black bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent mb-1">
                ランクマレコードへようこそ
              </h2>
              <p className="text-xs text-slate-400">プロセカ ランクマッチ専用レコードマネージャー</p>
            </div>

            <div className="space-y-3.5 text-left text-sm">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-start space-x-3.5">
                <div className="bg-pink-500/20 text-pink-400 p-2.5 rounded-xl shrink-0 font-bold">01</div>
                <div>
                  <h4 className="font-bold text-white text-xs">クラス1〜4の昇格・降格</h4>
                  <p className="text-xs text-slate-400 mt-0.5">5粒満タンからさらに1勝（6粒目）でクラス昇格！</p>
                </div>
              </div>

              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-start space-x-3.5">
                <div className="bg-purple-500/20 text-purple-400 p-2.5 rounded-xl shrink-0 font-bold">02</div>
                <div>
                  <h4 className="font-bold text-white text-xs">AP/FC＆勝敗の完全自動計算</h4>
                  <p className="text-xs text-slate-400 mt-0.5">判定数からAP・FC、残りライフ、両方AP引き分けまで自動検知します。</p>
                </div>
              </div>

              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-start space-x-3.5">
                <div className="bg-cyan-500/20 text-cyan-400 p-2.5 rounded-xl shrink-0 font-bold">03</div>
                <div>
                  <h4 className="font-bold text-white text-xs">戦績の深い分析</h4>
                  <p className="text-xs text-slate-400 mt-0.5">勝率や対戦ログ、点差の分析からマスターランクへの道のりをサポート。</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowWelcome(false)}
              className="w-full bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-black py-4 rounded-2xl transition shadow-lg shadow-pink-600/30 tracking-wider text-base"
            >
              RECORD START
            </button>
          </div>
        </div>
      )}
    </div>
  );
}