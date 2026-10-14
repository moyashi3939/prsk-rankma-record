'use client';

import { useState } from 'react';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (recordData: any) => void;
}

export default function RecordModal({ isOpen, onClose, onSubmit }: RecordModalProps) {
  const [matchForm, setMatchForm] = useState({
    songName: '',
    difficulty: 'EXPERT',
    level: '26',
    isOpponentHigher: false, // 格上フラグ（こちらは手動チェック）
    // 自分の判定数
    myPerf: '',
    myGreat: '',
    myGood: '',
    myBad: '',
    myMiss: '',
    // 相手の判定数
    oppPerf: '',
    oppGreat: '',
    oppGood: '',
    oppBad: '',
    oppMiss: '',
  });

  if (!isOpen) return null;

  // スコア計算式: パーフェクト3点、グレイト2点、グッド1点、バッド・ミス0点
  const calculateScore = (perf: string, great: string, good: string) => {
    const p = parseInt(perf) || 0;
    const gr = parseInt(great) || 0;
    const go = parseInt(good) || 0;
    return p * 3 + gr * 2 + go * 1;
  };

  // ライフ自動計算 (初期1000, MISS=-80, BAD=-50)
  const calculateLife = (badStr: string, missStr: string) => {
    const bad = parseInt(badStr) || 0;
    const miss = parseInt(missStr) || 0;
    const damage = (miss * 80) + (bad * 50);
    const remainingLife = 1000 - damage;
    return {
      remainingLife: Math.max(0, remainingLife),
      isLifeZero: remainingLife <= 0,
    };
  };

  // AP / FC 自動判定ロジック
  const checkComboStatus = (perfStr: string, grStr: string, goStr: string, bdStr: string, msStr: string) => {
    const perf = parseInt(perfStr) || 0;
    const gr = parseInt(grStr) || 0;
    const go = parseInt(goStr) || 0;
    const bd = parseInt(bdStr) || 0;
    const ms = parseInt(msStr) || 0;

    if (perf === 0 && gr === 0 && go === 0 && bd === 0 && ms === 0) {
      return { isAP: false, isFC: false };
    }

    const isAP = gr === 0 && go === 0 && bd === 0 && ms === 0 && perf > 0;
    const isFC = !isAP && go === 0 && bd === 0 && ms === 0 && (perf > 0 || gr > 0);

    return { isAP, isFC };
  };

  const myCalculatedScore = calculateScore(matchForm.myPerf, matchForm.myGreat, matchForm.myGood);
  const oppCalculatedScore = calculateScore(matchForm.oppPerf, matchForm.oppGreat, matchForm.oppGood);

  const myStatus = checkComboStatus(matchForm.myPerf, matchForm.myGreat, matchForm.myGood, matchForm.myBad, matchForm.myMiss);
  const oppStatus = checkComboStatus(matchForm.oppPerf, matchForm.oppGreat, matchForm.oppGood, matchForm.oppBad, matchForm.oppMiss);

  const myLifeStatus = calculateLife(matchForm.myBad, matchForm.myMiss);

  // 自動勝敗判定
  let result: 'WIN' | 'LOSE' | 'DRAW' = 'DRAW';
  if (myCalculatedScore > oppCalculatedScore) {
    result = 'WIN';
  } else if (myCalculatedScore < oppCalculatedScore) {
    result = 'LOSE';
  }

  // 両方APフラグの自動判定
  const isBothAP = result === 'DRAW' && myStatus.isAP && oppStatus.isAP;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...matchForm,
      myScore: myCalculatedScore,
      oppScore: oppCalculatedScore,
      myIsAP: myStatus.isAP,
      myIsFC: myStatus.isFC,
      oppIsAP: oppStatus.isAP,
      oppIsFC: oppStatus.isFC,
      isLifeZero: myLifeStatus.isLifeZero, // 自動判定されたライフ0フラグを送信
      isBothAP,
      result,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#080910]/85 backdrop-blur-xl z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-panel border border-white/15 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6 neon-glow-pink relative my-8">
        <div className="flex justify-between items-center border-b border-white/10 pb-4">
          <h3 className="text-xl font-black text-white flex items-center space-x-2">
            <span className="w-2.5 h-6 bg-pink-500 rounded-full"></span>
            <span>新規対戦レコード登録</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 text-sm">
          {/* ① 画像アップロード用ボタン */}
          <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/10 text-center space-y-2">
            <span className="text-xs font-bold text-slate-300 block">リザルト画像から自動読込 (任意)</span>
            <label className="inline-block cursor-pointer bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 px-6 rounded-xl border border-white/20 transition text-xs">
              📁 スクリーンショットを選択
              <input type="file" accept="image/*" className="hidden" />
            </label>
            <p className="text-[10px] text-slate-500">※リザルト画像をアップロードして自動解析（モック）</p>
          </div>

          {/* ② 曲名・難易度・レベル */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-300 mb-1">曲名</label>
              <input
                type="text"
                required
                placeholder="例: フォニイ"
                value={matchForm.songName}
                onChange={(e) => setMatchForm({ ...matchForm, songName: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">難易度</label>
              <select
                value={matchForm.difficulty}
                onChange={(e) => setMatchForm({ ...matchForm, difficulty: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500"
              >
                <option value="EXPERT">EXPERT</option>
                <option value="MASTER">MASTER</option>
                <option value="APPEND">APPEND</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">レベル</label>
              <input
                type="text"
                placeholder="例: 31"
                value={matchForm.level}
                onChange={(e) => setMatchForm({ ...matchForm, level: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>

          {/* ③ 格上チェックオプション */}
          <div className="bg-slate-900/40 p-4 rounded-2xl border border-white/5">
            <label className="flex items-center space-x-3 cursor-pointer bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition">
              <input
                type="checkbox"
                checked={matchForm.isOpponentHigher}
                onChange={(e) => setMatchForm({ ...matchForm, isOpponentHigher: e.target.checked })}
                className="w-4 h-4 accent-pink-500 rounded cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-200">🔥 格上マッチ相手だった</span>
            </label>
          </div>

          {/* ④ 自分のリザルト (判定数 & ライフ自動計算表示) */}
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-cyan-400 text-xs tracking-wider">自分の判定数 ＆ スコア</span>
                {myStatus.isAP && <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-black px-2 py-0.5 rounded-md">ALL PERFECT</span>}
                {myStatus.isFC && <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[10px] font-black px-2 py-0.5 rounded-md">FULL COMBO</span>}
                {myLifeStatus.isLifeZero && <span className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-black px-2 py-0.5 rounded-md">❤️ ライフ0耐え</span>}
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-[11px] text-slate-400 font-mono">残ライフ: <span className={`font-bold ${myLifeStatus.isLifeZero ? 'text-red-400' : 'text-cyan-300'}`}>{myLifeStatus.remainingLife} / 1000</span></span>
                <span className="text-xs bg-cyan-500/20 text-cyan-300 px-3 py-1 rounded-full font-mono font-bold">
                  算出スコア: {myCalculatedScore} pt
                </span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">PERFECT (3pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.myPerf}
                  onChange={(e) => setMatchForm({ ...matchForm, myPerf: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">GREAT (2pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.myGreat}
                  onChange={(e) => setMatchForm({ ...matchForm, myGreat: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">GOOD (1pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.myGood}
                  onChange={(e) => setMatchForm({ ...matchForm, myGood: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">BAD (50dmg)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.myBad}
                  onChange={(e) => setMatchForm({ ...matchForm, myBad: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">MISS (80dmg)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.myMiss}
                  onChange={(e) => setMatchForm({ ...matchForm, myMiss: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* ⑤ 相手のリザルト (判定数) */}
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-pink-400 text-xs tracking-wider">相手のリザルト ＆ スコア</span>
                {oppStatus.isAP && <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-black px-2 py-0.5 rounded-md">ALL PERFECT</span>}
                {oppStatus.isFC && <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[10px] font-black px-2 py-0.5 rounded-md">FULL COMBO</span>}
              </div>
              <span className="text-xs bg-pink-500/20 text-pink-300 px-3 py-1 rounded-full font-mono font-bold">
                算出スコア: {oppCalculatedScore} pt
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">PERFECT (3pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.oppPerf}
                  onChange={(e) => setMatchForm({ ...matchForm, oppPerf: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">GREAT (2pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.oppGreat}
                  onChange={(e) => setMatchForm({ ...matchForm, oppGreat: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">GOOD (1pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.oppGood}
                  onChange={(e) => setMatchForm({ ...matchForm, oppGood: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">BAD (50dmg)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.oppBad}
                  onChange={(e) => setMatchForm({ ...matchForm, oppBad: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">MISS (80dmg)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.oppMiss}
                  onChange={(e) => setMatchForm({ ...matchForm, oppMiss: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
            </div>
          </div>

          {/* ⑥ 自動判定結果のプレビュー */}
          <div className="p-4 rounded-2xl border flex items-center justify-between bg-slate-900/80 border-white/10">
            <span className="text-xs text-slate-400 font-semibold">判定されるマッチ結果：</span>
            <span
              className={`text-sm font-black px-4 py-1.5 rounded-xl tracking-wider ${
                result === 'WIN' || isBothAP
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                  : result === 'LOSE'
                  ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40 shadow-[0_0_10px_rgba(236,72,153,0.3)]'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {result === 'WIN'
                ? '🎉 WIN (粒 +1)'
                : isBothAP
                ? '⭐ BOTH AP (粒 +1)'
                : result === 'LOSE'
                ? '💀 LOSE (粒 -1)'
                : '⚖️ DRAW (変動なし)'}
            </span>
          </div>

          {/* 登録ボタン */}
          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition text-xs"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="w-2/3 bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-black py-3 rounded-xl transition shadow-lg shadow-pink-600/30 text-xs tracking-wider"
            >
              レコードを保存する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}