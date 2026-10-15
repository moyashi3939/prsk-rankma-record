'use client';

import { useState, useEffect } from 'react';

interface SongFromDB {
  id: number;
  song_name: string;
  difficulty: string;
  level: string;
  total_notes: number;
}

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (recordData: any) => void;
}

const initialFormState = {
  songNameInput: '',
  difficulty: 'MASTER',
  level: '31',
  isOpponentHigher: false,
  myGreat: '',
  myGood: '',
  myBad: '',
  myMiss: '',
  oppGreat: '',
  oppGood: '',
  oppBad: '',
  oppMiss: '',
};

export default function RecordModal({ isOpen, onClose, onSubmit }: RecordModalProps) {
  const [songs, setSongs] = useState<SongFromDB[]>([]);
  const [matchForm, setMatchForm] = useState(initialFormState);

  // フォーム初期化処理
  const resetForm = () => {
    setMatchForm(initialFormState);
  };

  // モーダルが開いたときにDBから楽曲データを取得
  useEffect(() => {
    if (isOpen) {
      fetch('/api/songs')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setSongs(data);
        })
        .catch(() => {
          setSongs([
            { id: 1, song_name: 'フォニイ', difficulty: 'EXPERT', level: '26', total_notes: 850 },
            { id: 2, song_name: 'フォニイ', difficulty: 'MASTER', level: '31', total_notes: 1420 },
            { id: 3, song_name: '千本桜', difficulty: 'MASTER', level: '32', total_notes: 1550 },
          ]);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const uniqueSongNames = Array.from(new Set(songs.map((s) => s.song_name)));
  const availableSongsForCurrent = songs.filter((s) => s.song_name === matchForm.songNameInput);
  const availableDifficulties = availableSongsForCurrent.map((s) => s.difficulty);

  const currentSongDiffData = availableSongsForCurrent.find((s) => s.difficulty === matchForm.difficulty);
  const totalNotes = currentSongDiffData ? currentSongDiffData.total_notes : 1000;
  const currentLevel = currentSongDiffData ? currentSongDiffData.level : matchForm.level;

  // ① 自分の判定数（PERFECT自動逆算）
  const myGr = parseInt(matchForm.myGreat) || 0;
  const myGo = parseInt(matchForm.myGood) || 0;
  const myBd = parseInt(matchForm.myBad) || 0;
  const myMs = parseInt(matchForm.myMiss) || 0;
  const myCalculatedPerf = Math.max(0, totalNotes - (myGr + myGo + myBd + myMs));

  // ② 相手の判定数（PERFECT自動逆算）
  const oppGr = parseInt(matchForm.oppGreat) || 0;
  const oppGo = parseInt(matchForm.oppGood) || 0;
  const oppBd = parseInt(matchForm.oppBad) || 0;
  const oppMs = parseInt(matchForm.oppMiss) || 0;
  const oppCalculatedPerf = Math.max(0, totalNotes - (oppGr + oppGo + oppBd + oppMs));

  // スコア計算
  const calculateScore = (perf: number, great: number, good: number) => perf * 3 + great * 2 + good * 1;
  const myCalculatedScore = calculateScore(myCalculatedPerf, myGr, myGo);
  const oppCalculatedScore = calculateScore(oppCalculatedPerf, oppGr, oppGo);

  // ライフ自動計算
  const myDamage = myMs * 80 + myBd * 50;
  const myRemainingLife = Math.max(0, 1000 - myDamage);
  const isLifeZero = myRemainingLife <= 0;

  // AP / FC 自動判定
  const isAP = myGr === 0 && myGo === 0 && myBd === 0 && myMs === 0 && myCalculatedPerf > 0;
  const isFC = !isAP && myGo === 0 && myBd === 0 && myMs === 0 && (myCalculatedPerf > 0 || myGr > 0);
  const oppIsAP = oppGr === 0 && oppGo === 0 && oppBd === 0 && oppMs === 0 && oppCalculatedPerf > 0;

  // 自動勝敗判定
  let result: 'WIN' | 'LOSE' | 'DRAW' = 'DRAW';
  if (myCalculatedScore > oppCalculatedScore) result = 'WIN';
  else if (myCalculatedScore < oppCalculatedScore) result = 'LOSE';

  const isBothAP = result === 'DRAW' && isAP && oppIsAP;

  const handleSongInputChange = (value: string) => {
    setMatchForm((prev) => ({ ...prev, songNameInput: value }));
    const matched = songs.filter((s) => s.song_name === value);
    if (matched.length > 0) {
      setMatchForm((prev) => ({
        ...prev,
        songNameInput: value,
        difficulty: matched[0].difficulty,
        level: matched[0].level,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...matchForm,
      songName: matchForm.songNameInput,
      difficulty: matchForm.difficulty,
      level: currentLevel,
      myPerf: myCalculatedPerf,
      oppPerf: oppCalculatedPerf,
      myScore: myCalculatedScore,
      oppScore: oppCalculatedScore,
      myIsAP: isAP,
      myIsFC: isFC,
      isLifeZero,
      isBothAP,
      result,
    });
    
    // 保存後にフォームの入力をリセットして閉じる
    resetForm();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#080910]/85 backdrop-blur-xl z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-panel border border-white/15 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6 neon-glow-pink my-auto max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-white/10 pb-4 sticky top-0 bg-[#080910]/90 backdrop-blur-md z-10 -mx-6 -mt-6 p-6 md:-mx-8 md:-mt-8 md:p-8">
          <h3 className="text-xl font-black text-white flex items-center space-x-2">
            <span className="w-2.5 h-6 bg-pink-500 rounded-full"></span>
            <span>新規対戦レコード登録（両者PERFECT自動逆算）</span>
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 text-sm pt-2">
          {/* ① 曲名・難易度・レベル */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">曲名 (サジェスト対応)</label>
              <input
                type="text"
                list="song-suggestions"
                required
                placeholder="例: フォニイ"
                value={matchForm.songNameInput}
                onChange={(e) => handleSongInputChange(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500 text-xs"
              />
              <datalist id="song-suggestions">
                {uniqueSongNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">難易度 (自動絞込)</label>
              <select
                value={matchForm.difficulty}
                onChange={(e) => setMatchForm({ ...matchForm, difficulty: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500 text-xs"
              >
                {availableDifficulties.length > 0 ? (
                  availableDifficulties.map((diff) => (
                    <option key={diff} value={diff}>{diff}</option>
                  ))
                ) : (
                  <>
                    <option value="EXPERT">EXPERT</option>
                    <option value="MASTER">MASTER</option>
                    <option value="APPEND">APPEND</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">レベル (自動入力)</label>
              <input
                type="text"
                disabled
                value={currentLevel}
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-2.5 text-cyan-400 font-bold text-center focus:outline-none cursor-not-allowed text-xs"
              />
            </div>
          </div>

          {/* 総ノーツ数表示 */}
          <div className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-cyan-500/10 p-3 rounded-xl border border-white/10 flex justify-between items-center text-xs">
            <span className="text-slate-300">曲の総ノーツ数: <strong className="text-white font-mono text-sm">{totalNotes}</strong></span>
            <span className="text-cyan-400 font-semibold">※GREAT等を入力すると両者のPERFECTが自動逆算されます</span>
          </div>

          {/* ② 格上チェック */}
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

          {/* ③ 自分のリザルト */}
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-cyan-400 text-xs tracking-wider">自分の判定数 ＆ スコア</span>
                {isAP && <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-black px-2 py-0.5 rounded-md">ALL PERFECT</span>}
                {isFC && <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[10px] font-black px-2 py-0.5 rounded-md">FULL COMBO</span>}
                {isLifeZero && <span className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-black px-2 py-0.5 rounded-md">❤️ ライフ0耐え</span>}
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-[11px] text-slate-400 font-mono">残ライフ: <span className={`font-bold ${isLifeZero ? 'text-red-400' : 'text-cyan-300'}`}>{myRemainingLife} / 1000</span></span>
                <span className="text-xs bg-cyan-500/20 text-cyan-300 px-3 py-1 rounded-full font-mono font-bold">
                  算出スコア: {myCalculatedScore} pt
                </span>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="block text-[10px] text-amber-400 mb-1">PERFECT (自動)</label>
                <div className="w-full bg-slate-950 border border-amber-500/30 rounded-lg px-2 py-2 text-center text-amber-300 font-mono font-bold text-xs">
                  {myCalculatedPerf}
                </div>
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

          {/* ④ 相手のリザルト */}
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-pink-400 text-xs tracking-wider">相手のリザルト ＆ スコア</span>
                {oppIsAP && <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-black px-2 py-0.5 rounded-md">OPP ALL PERFECT</span>}
              </div>
              <span className="text-xs bg-pink-500/20 text-pink-300 px-3 py-1 rounded-full font-mono font-bold">
                算出スコア: {oppCalculatedScore} pt
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="block text-[10px] text-amber-400 mb-1">PERFECT (自動)</label>
                <div className="w-full bg-slate-950 border border-amber-500/30 rounded-lg px-2 py-2 text-center text-amber-300 font-mono font-bold text-xs">
                  {oppCalculatedPerf}
                </div>
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

          {/* ⑤ プレビュー */}
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

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
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