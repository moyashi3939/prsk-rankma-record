'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminHomePage() {
  const [seasons, setSeasons] = useState<any[]>([]);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [message, setMessage] = useState('');

  // シーズン一覧のロード
  const fetchSeasons = () => {
    fetch('/api/admin/seasons')
      .then((res) => res.json())
      .then((data) => {
        if (data.seasons) setSeasons(data.seasons);
      })
      .catch((err) => console.error('シーズン取得エラー:', err));
  };

  useEffect(() => {
    fetchSeasons();
  }, []);

  // 残り日数を自動計算する関数 (現在時刻と終了日時を比較)
  const calculateDaysLeft = (endTimeStr: string) => {
    const end = new Date(endTimeStr).getTime();
    const now = new Date().getTime();
    const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // 新規シーズン追加
  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSeasonName || !newStart || !newEnd) {
      alert('すべての項目を入力してください。');
      return;
    }

    try {
      const res = await fetch('/api/admin/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          seasonName: newSeasonName,
          startTime: newStart,
          endTime: newEnd,
        }),
      });

      if (res.ok) {
        setMessage('✨ 新しいシーズンを追加しました！');
        setNewSeasonName('');
        setNewStart('');
        setNewEnd('');
        fetchSeasons();
      } else {
        alert('追加に失敗しました。');
      }
    } catch (err) {
      alert('通信エラーが発生しました。');
    }
  };

  // 現在のシーズンに切替
  const handleSetCurrent = async (seasonName: string) => {
    try {
      const res = await fetch('/api/admin/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_current', seasonName }),
      });

      if (res.ok) {
        setMessage(`🏆 現在のシーズンを「${seasonName}」に変更しました！`);
        fetchSeasons();
      }
    } catch (err) {
      alert('切替に失敗しました。');
    }
  };

  // すべてのシーズンの適用を解除
  const handleUnsetCurrent = async () => {
    try {
      const res = await fetch('/api/admin/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unset_current' }),
      });

      if (res.ok) {
        setMessage('🔒 すべてのシーズンの適用を解除しました。');
        fetchSeasons();
      }
    } catch (err) {
      alert('解除に失敗しました。');
    }
  };

  // シーズン削除
  const handleDeleteSeason = async (seasonName: string, isCurrent: boolean) => {
    if (isCurrent) {
      alert('現在アクティブなシーズンは、先に「適用解除」を行ってから削除してください。');
      return;
    }
    if (!confirm(`本当に「${seasonName}」を削除しますか？`)) return;

    try {
      const res = await fetch(`/api/admin/seasons?name=${encodeURIComponent(seasonName)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessage(`🗑️ 「${seasonName}」を削除しました。`);
        fetchSeasons();
      }
    } catch (err) {
      alert('削除に失敗しました。');
    }
  };

  return (
    <div className="min-h-screen bg-[#080910] text-white pb-16 pt-8 px-6">
      <main className="max-w-4xl mx-auto space-y-8">
        {/* ヘッダー */}
        <div className="flex justify-between items-center border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                ADMIN PORTAL
              </span>
              <h1 className="text-3xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                ADMIN HOME
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">シーズン詳細スケジュール管理・全体設定</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/songs" className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs transition">
              🎵 楽曲管理へ
            </Link>
            <Link href="/admin/jackets" className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs transition">
              🖼️ ジャケット管理へ
            </Link>
            <Link href="/settings" className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs transition">
              ⚙️ ユーザー設定へ
            </Link>
            <Link href="/" className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs transition">
              ← ホームに戻る
            </Link>
          </div>
        </div>

        {message && (
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-bold text-center">
            {message}
          </div>
        )}

        {/* 1. シーズン新規追加フォーム */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4 bg-slate-900/40">
          <h3 className="text-base font-black text-purple-400 flex items-center space-x-2">
            <span>➕ 新規シーズンの追加（日本時間指定）</span>
          </h3>
          <form onSubmit={handleCreateSeason} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">シーズン名</label>
              <input
                type="text"
                value={newSeasonName}
                onChange={(e) => setNewSeasonName(e.target.value)}
                placeholder="例: Season 2"
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">開始日時 (JST)</label>
              <input
                type="datetime-local"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">終了日時 (JST)</label>
              <input
                type="datetime-local"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono focus:border-purple-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-xl text-xs transition shadow-md h-[34px]"
            >
              追加する
            </button>
          </form>
        </div>

        {/* 2. 登録済みシーズン一覧 & 自動残り日数計算 */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4 bg-slate-900/40">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-black text-cyan-400 flex items-center space-x-2">
              <span>🏆 シーズン一覧 ＆ 残り日数自動計算</span>
            </h3>
            <button
              type="button"
              onClick={handleUnsetCurrent}
              className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-xl text-xs font-bold transition"
            >
              すべての適用を解除
            </button>
          </div>

          <div className="space-y-3">
            {seasons.map((season, idx) => {
              const daysLeft = calculateDaysLeft(season.end_time);
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                    season.is_current ? 'bg-purple-950/20 border-purple-500/40' : 'bg-slate-950 border-white/5'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-black text-white">{season.season_name}</span>
                      {season.is_current && (
                        <span className="bg-purple-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                          開催中 (Active)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      📅 {new Date(season.start_time).toLocaleString('ja-JP')} 〜 {new Date(season.end_time).toLocaleString('ja-JP')}
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">自動計算残り日数</span>
                      <span className="text-cyan-300 font-mono font-black text-sm">残り {daysLeft} 日</span>
                    </div>

                    <div className="flex gap-2">
                      {!season.is_current ? (
                        <button
                          type="button"
                          onClick={() => handleSetCurrent(season.season_name)}
                          className="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/40 px-3 py-1.5 rounded-xl text-xs font-bold transition"
                        >
                          適用する
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleUnsetCurrent}
                          className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-xl text-xs font-bold transition"
                        >
                          適用解除
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteSeason(season.season_name, season.is_current)}
                        className="bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 px-3 py-1.5 rounded-xl text-xs font-bold transition"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. その他管理者機能へのカード */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-panel p-6 rounded-3xl border border-pink-500/20 bg-pink-950/10 space-y-3">
            <h3 className="text-base font-black text-pink-400 flex items-center space-x-2">
              <span>🎵 楽曲マスタデータ管理</span>
            </h3>
            <p className="text-xs text-slate-400">対戦記録用の楽曲リストや難易度データを編集します。</p>
            <Link
              href="/admin/songs"
              className="inline-block w-full text-center bg-gradient-to-r from-pink-600 to-purple-600 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-lg"
            >
              楽曲管理画面へ →
            </Link>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-3 bg-slate-900/40">
            <h3 className="text-base font-black text-cyan-400 flex items-center space-x-2">
              <span>📊 システムステータス</span>
            </h3>
            <div className="space-y-2 pt-1 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-white/5 flex justify-between">
                <span className="text-slate-400">サーバー状態</span>
                <span className="text-emerald-400 font-bold">🟢 正常稼働中</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}