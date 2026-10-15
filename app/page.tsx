'use client';

import { useState, useEffect } from 'react';
import RecordModal from '@/components/RecordModal';
import Link from 'next/link';

const CLASSES = ['クラス 1', 'クラス 2', 'クラス 3', 'クラス 4'];
const RANKS = ['ルーキー', 'ブロンズ', 'シルバー', 'ゴールド', 'プラチナ', 'ダイヤモンド', 'マスター'];

export default function Home() {
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showPlacementModal, setShowPlacementModal] = useState(false);
  const [matchLogs, setMatchLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [rankData, setRankData] = useState({
    seasonId: 'Season 1',
    rankName: '判定マッチ',
    classIndex: 0,
    grains: 0,
    placementMatchesPlayed: 0,
    isPlacementCompleted: false,
  });

  const [stats, setStats] = useState({ wins: 0, losses: 0, draws: 0, totalMatches: 0 });

  // 初期データ＆ランク状態のロード
  useEffect(() => {
    Promise.all([
      fetch('/api/history').then((res) => res.json()),
      fetch('/api/rank').then((res) => res.json()),
    ])
      .then(([historyData, rankStatusData]) => {
        if (Array.isArray(historyData)) {
          setMatchLogs(historyData);
          let wins = 0, losses = 0, draws = 0;
          historyData.forEach((m: any) => {
            if (m.result.includes('WIN')) wins++;
            else if (m.result === 'LOSE') losses++;
            else draws++;
          });
          setStats({ wins, losses, draws, totalMatches: historyData.length });
        }

        if (rankStatusData && !rankStatusData.error) {
          setRankData({
            seasonId: rankStatusData.seasonId || 'Season 1',
            rankName: rankStatusData.rankName || '判定マッチ',
            classIndex: rankStatusData.classIndex ?? 0,
            grains: rankStatusData.grains ?? 0,
            placementMatchesPlayed: rankStatusData.placementMatchesPlayed ?? 0,
            isPlacementCompleted: rankStatusData.isPlacementCompleted ?? false,
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('データ取得失敗:', err);
        setLoading(false);
      });
  }, []);

  const updateRankStatusOnServer = async (updatedData: any) => {
    try {
      await fetch('/api/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
    } catch (err) {
      console.error('ランク状態の保存に失敗:', err);
    }
  };

  const handleRecordSubmit = async (recordData: any) => {
    const { result, isBothAP } = recordData;
    let actualResult = result;
    if (result === 'DRAW' && isBothAP) actualResult = 'WIN (AP DRAW)';

    let newGrains = rankData.grains;
    let newClassIndex = rankData.classIndex;
    let newPlacementPlayed = rankData.placementMatchesPlayed;
    let newPlacementCompleted = rankData.isPlacementCompleted;
    let newRankName = rankData.rankName;

    if (!newPlacementCompleted) {
      newPlacementPlayed += 1;
      if (newPlacementPlayed >= 3) {
        newPlacementCompleted = true;
        setShowPlacementModal(true);
      }
    } else if (newRankName === 'マスター') {
      if (actualResult.includes('WIN')) newGrains += 1;
      else if (result === 'LOSE') newGrains = Math.max(0, newGrains - 1);
    } else {
      if (actualResult.includes('WIN')) {
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
    }

    const updatedRankStatus = {
      seasonId: rankData.seasonId,
      rankName: newRankName,
      classIndex: newClassIndex,
      grains: newGrains,
      placementMatchesPlayed: newPlacementPlayed,
      isPlacementCompleted: newPlacementCompleted,
    };

    setRankData(updatedRankStatus);
    await updateRankStatusOnServer(updatedRankStatus);

    const payload = { ...recordData, result: actualResult, seasonId: rankData.seasonId };

    try {
      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save match');
      const json = await response.json();

      setStats((prev) => ({
        wins: prev.wins + (actualResult.includes('WIN') ? 1 : 0),
        losses: prev.losses + (result === 'LOSE' ? 1 : 0),
        draws: prev.draws + (result === 'DRAW' && !isBothAP ? 1 : 0),
        totalMatches: prev.totalMatches + 1,
      }));

      setMatchLogs((prev) => [json.match, ...prev]);
    } catch (error) {
      console.error('保存エラー:', error);
      alert('対戦データの保存に失敗しました。');
    }
  };

  const winRate = stats.totalMatches > 0 ? ((stats.wins / stats.totalMatches) * 100).toFixed(1) : '0.0';
  const isMaster = rankData.rankName === 'マスター';
  const isPlacement = !rankData.isPlacementCompleted;

  return (
    <div className="min-h-screen bg-[#080910] text-white selection:bg-pink-500 selection:text-white pb-16 pt-8 px-6 space-y-8">
      <main className="max-w-6xl mx-auto space-y-8">
        
        {/* メインステージ・カード */}
        <div className="glass-panel rounded-3xl p-8 relative overflow-hidden neon-glow-pink border border-white/10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
            <div>
              <div className="flex items-center space-x-3 mb-3">
                <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
                  {rankData.seasonId}
                </span>
                {isPlacement && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-full text-xs font-bold">
                    ⚔️ ランク判定マッチ進行中 ({rankData.placementMatchesPlayed}/3戦)
                  </span>
                )}
              </div>

              <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2 flex items-baseline space-x-3">
                <span>{rankData.rankName}</span>
                {!isMaster && !isPlacement && (
                  <span className="text-2xl text-cyan-400 font-bold">{CLASSES[rankData.classIndex]}</span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {isPlacement 
                  ? '最初の3戦で実力を測定中！勝敗に関わらず最後まで戦い抜け！' 
                  : isMaster 
                  ? 'マスターランク帯：限界なき粒数無限蓄積モード' 
                  : '5粒満タンからさらに1勝（6粒目）で昇格！次のクラスを目指そう'}
              </p>
            </div>

            {/* インジケーター */}
            <div className="bg-slate-900/80 border border-white/10 p-5 rounded-2xl flex flex-col items-center min-w-[240px]">
              <span className="text-[11px] text-slate-400 mb-2 font-semibold uppercase tracking-wider">
                {isMaster ? '現在の累計ランク粒（無限）' : isPlacement ? '判定マッチ進捗' : '現在のランク粒'}
              </span>
              
              {isMaster ? (
                <div className="text-3xl font-black text-amber-300 font-mono py-2">
                  💎 {rankData.grains} 粒
                </div>
              ) : isPlacement ? (
                <div className="flex space-x-2 mb-3">
                  {[1, 2, 3].map((num) => (
                    <div key={num} className={`w-9 h-10 rounded-lg border flex items-center justify-center font-mono font-bold ${num <= rankData.placementMatchesPlayed ? 'bg-amber-500 text-black border-amber-300' : 'bg-slate-800 text-slate-600'}`}>
                      {num}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex space-x-2 mb-3">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <div key={num} className={`w-7 h-9 rounded-lg border flex items-center justify-center transition-all ${num <= rankData.grains ? 'bg-gradient-to-t from-pink-600 to-cyan-400 border-white/40 shadow-[0_0_12px_rgba(6,182,212,0.5)] scale-105' : 'bg-slate-800/80 border-slate-700/50'}`}>
                        <span className={`text-xs font-bold ${num <= rankData.grains ? 'text-white' : 'text-slate-600'}`}>{num}</span>
                      </div>
                    ))}
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-white/5">
                    <div className="bg-gradient-to-r from-cyan-400 to-pink-500 h-full transition-all duration-500" style={{ width: `${(Math.min(rankData.grains, 5) / 5) * 100}%` }}></div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* スタッツ群 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div className="glass-panel p-6 rounded-3xl md:col-span-2 flex flex-col justify-between border border-white/15">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">通算勝率 (WIN RATE)</span>
            <div className="flex items-baseline space-x-4 my-4">
              <span className="text-5xl font-black text-cyan-400 tracking-tighter">{winRate}%</span>
              <span className="text-sm text-slate-400">({stats.wins}勝 / {stats.losses}敗 / {stats.draws}分)</span>
            </div>
            <div className="w-full bg-slate-800/80 h-2.5 rounded-full overflow-hidden border border-white/5">
              <div className="bg-gradient-to-r from-cyan-400 to-pink-500 h-full" style={{ width: `${winRate}%` }}></div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between border border-white/15">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">総対戦試合数</span>
            <div className="my-3"><span className="text-3xl font-black text-white">#{stats.totalMatches}</span></div>
            <span className="text-[11px] text-slate-500">これまでのトータルマッチ</span>
          </div>

          <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between border border-white/15">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">アナリティクス</span>
            <div className="my-3">
              <Link href="/analytics" className="text-xs font-bold text-cyan-400 hover:underline">
                → ニューラル分析を見る
              </Link>
            </div>
            <span className="text-[11px] text-slate-500">詳細な戦術データを閲覧</span>
          </div>
        </div>

        {/* 直近の対戦ログ */}
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

          {loading ? (
            <div className="text-center py-8 text-slate-500 text-xs">読み込み中...</div>
          ) : matchLogs.length === 0 ? (
            <div className="border border-dashed border-white/10 rounded-2xl p-12 text-center text-slate-500 text-sm">
              まだ対戦記録がありません。「+ 試合を記録する」から最初のスコアを刻みましょう！
            </div>
          ) : (
            <div className="space-y-3">
              {matchLogs.slice(0, 5).map((log) => {
                const scoreDiff = (log.my_score ?? log.myScore) - (log.opp_score ?? log.oppScore);
                const diffText = scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`;
                const isWin = log.result.includes('WIN');

                return (
                  <div key={log.id} className="bg-slate-900/60 border border-white/10 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <span className={`px-3 py-1 rounded-xl text-xs font-black tracking-wider shrink-0 ${isWin ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-pink-500/20 text-pink-300 border border-pink-500/40'}`}>
                        {log.result}
                      </span>
                      <div>
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <h4 className="font-bold text-white text-sm">{log.song_name || log.songName}</h4>
                          <span className="text-xs text-slate-400">({log.difficulty} Lv.{log.level})</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 font-mono">
                          自分: <span className="text-cyan-300 font-bold">{log.my_score ?? log.myScore} pt</span> vs 相手: <span className="text-pink-300 font-bold">{log.opp_score ?? log.oppScore} pt</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 self-end md:self-auto bg-slate-950/60 px-3 py-1.5 rounded-xl border border-white/5 font-mono">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">点差:</span>
                      <span className={`text-xs font-black ${scoreDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{diffText} pt</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <RecordModal isOpen={showRecordModal} onClose={() => setShowRecordModal(false)} onSubmit={handleRecordSubmit} />

      {/* 判定マッチ完了後のランク＆クラス設定モーダル */}
      {showPlacementModal && (
        <div className="fixed inset-0 bg-[#080910]/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="glass-panel border border-cyan-500/40 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6 neon-glow-cyan">
            <div>
              <h3 className="text-xl font-black text-cyan-300">⚔️ ランク判定マッチ完了！</h3>
              <p className="text-xs text-slate-300 mt-1">
                3戦の判定マッチお疲れ様でした！あなたが最初所属するランクとクラスを選択してください。
              </p>
            </div>

            <div className="space-y-4 text-left">
              {/* ランク選択 */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">初期ランク</label>
                <select
                  id="selected-rank"
                  onChange={(e) => {
                    const classContainer = document.getElementById('selected-class-container');
                    if (classContainer) {
                      if (e.target.value === 'マスター') {
                        classContainer.classList.add('hidden');
                      } else {
                        classContainer.classList.remove('hidden');
                      }
                    }
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500"
                >
                  {RANKS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* クラス選択（マスター以外で表示） */}
              <div id="selected-class-container">
                <label className="block text-xs font-semibold text-slate-400 mb-1">初期クラス</label>
                <select
                  id="selected-class"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500"
                >
                  {CLASSES.map((c, idx) => (
                    <option key={c} value={idx}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={async () => {
                const rankEl = document.getElementById('selected-rank') as HTMLSelectElement;
                const classEl = document.getElementById('selected-class') as HTMLSelectElement;
                
                const chosenRank = rankEl ? rankEl.value : 'ダイヤモンド';
                const chosenClassIndex = classEl ? parseInt(classEl.value, 10) : 0;
                
                const isChosenMaster = chosenRank === 'マスター';

                const updated = {
                  ...rankData,
                  rankName: chosenRank,
                  classIndex: isChosenMaster ? 0 : chosenClassIndex,
                  grains: 1, // ★配属直後は1粒固定
                  isPlacementCompleted: true,
                };

                setRankData(updated);
                await updateRankStatusOnServer(updated);
                setShowPlacementModal(false);
              }}
              className="w-full bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-black py-3 rounded-xl text-xs tracking-wider transition shadow-lg shadow-cyan-500/20"
            >
              ランク・クラスを決定してスタート
            </button>
          </div>
        </div>
      )}
    </div>
  );
}