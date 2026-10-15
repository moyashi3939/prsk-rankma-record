'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminSongsPage() {
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [songName, setSongName] = useState('');
  const [expLevel, setExpLevel] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [mstLevel, setMstLevel] = useState('');
  const [mstNotes, setMstNotes] = useState('');
  const [appLevel, setAppLevel] = useState('');
  const [appNotes, setAppNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 楽曲一覧の取得
  const fetchSongs = async () => {
    try {
      const res = await fetch('/api/songs');
      const data = await res.json();
      if (Array.isArray(data)) {
        setSongs(data);
      }
    } catch (err) {
      console.error('取得失敗:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  // フォーム送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!songName.trim()) return;

    setSubmitting(true);
    try {
      const difficulties = [
        { name: 'EXPERT', level: expLevel, notes: expNotes },
        { name: 'MASTER', level: mstLevel, notes: mstNotes },
        { name: 'APPEND', level: appLevel, notes: appNotes },
      ];

      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songName, difficulties }),
      });

      if (res.ok) {
        // フォームをリセットして一覧を再取得
        setSongName('');
        setExpLevel('');
        setExpNotes('');
        setMstLevel('');
        setMstNotes('');
        setAppLevel('');
        setAppNotes('');
        fetchSongs();
        alert('楽曲データを登録・更新しました！');
      } else {
        alert('登録に失敗しました。');
      }
    } catch (err) {
      console.error('送信エラー:', err);
      alert('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080910] text-white p-8 space-y-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-black bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent">
            ⚙️ 楽曲辞書 管理者パネル
          </h1>
          <Link
            href="/"
            className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-xl text-xs transition"
          >
            ← ホームに戻る
          </Link>
        </div>

        {/* 楽曲一括登録・追加入力フォーム */}
        <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-3xl border border-white/10 space-y-5">
          <h2 className="font-bold text-sm text-slate-200">楽曲データの登録・追加（後からのAPPEND追加や修正も対応）</h2>
          
          <div className="space-y-1">
            <label className="text-xs text-slate-400">曲名（既存の曲名を入力すると後からAPPEND等の追加・修正ができます）</label>
            <input
              type="text"
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              placeholder="例: フォニイ"
              required
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-white/10">
            {/* EXPERT */}
            <div className="space-y-2 bg-slate-900/50 p-4 rounded-2xl border border-white/5">
              <span className="text-xs font-bold text-cyan-300">EXPERT</span>
              <input
                type="text"
                value={expLevel}
                onChange={(e) => setExpLevel(e.target.value)}
                placeholder="レベル (例: 28)"
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
              <input
                type="number"
                value={expNotes}
                onChange={(e) => setExpNotes(e.target.value)}
                placeholder="総ノーツ数"
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* MASTER */}
            <div className="space-y-2 bg-slate-900/50 p-4 rounded-2xl border border-white/5">
              <span className="text-xs font-bold text-pink-400">MASTER</span>
              <input
                type="text"
                value={mstLevel}
                onChange={(e) => setMstLevel(e.target.value)}
                placeholder="レベル (例: 32)"
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
              <input
                type="number"
                value={mstNotes}
                onChange={(e) => setMstNotes(e.target.value)}
                placeholder="総ノーツ数"
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* APPEND */}
            <div className="space-y-2 bg-slate-900/50 p-4 rounded-2xl border border-white/5">
              <span className="text-xs font-bold text-amber-300">APPEND (後から追加もOK)</span>
              <input
                type="text"
                value={appLevel}
                onChange={(e) => setAppLevel(e.target.value)}
                placeholder="レベル"
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
              <input
                type="number"
                value={appNotes}
                onChange={(e) => setAppNotes(e.target.value)}
                placeholder="総ノーツ数"
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-lg disabled:opacity-50"
          >
            {submitting ? '登録中...' : 'データを登録・更新する'}
          </button>
        </form>

        {/* 登録済み楽曲一覧 */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <h2 className="font-bold text-sm text-slate-200">登録済み楽曲一覧 ({songs.length}件)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-3">曲名</th>
                  <th className="pb-3">難易度</th>
                  <th className="pb-3">レベル</th>
                  <th className="pb-3">総ノーツ数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">読み込み中...</td>
                  </tr>
                ) : songs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      まだ楽曲が登録されていません。上のフォームから追加してください！
                    </td>
                  </tr>
                ) : (
                  songs.map((song: any) => (
                    <tr key={song.id} className="hover:bg-white/5">
                      <td className="py-3 font-bold text-white">{song.song_name}</td>
                      <td className="py-3 text-cyan-300 font-semibold">{song.difficulty}</td>
                      <td className="py-3 text-slate-300">{song.level}</td>
                      <td className="py-3 font-mono text-pink-400">{song.total_notes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}