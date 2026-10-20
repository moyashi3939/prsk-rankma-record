'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { parseCsv } from '@/lib/csv';

export default function AdminSongsPage() {
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 単体登録フォーム用 State
  const [songName, setSongName] = useState('');
  const [expLevel, setExpLevel] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [mstLevel, setMstLevel] = useState('');
  const [mstNotes, setMstNotes] = useState('');
  const [appLevel, setAppLevel] = useState('');
  const [appNotes, setAppNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // CSV一括インポート用 State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');

  // 楽曲一覧の絞り込み（各欄の検索）
  const [fName, setFName] = useState('');
  const [fDifficulty, setFDifficulty] = useState('');
  const [fLevel, setFLevel] = useState('');
  const [fNotes, setFNotes] = useState('');

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

  // 一覧にある難易度（絞り込みの選択肢）
  const difficultyOptions = useMemo(
    () => Array.from(new Set(songs.map((s: any) => s.difficulty))).filter(Boolean) as string[],
    [songs]
  );

  // 各欄の条件にすべて当てはまる曲だけを表示する
  const filteredSongs = useMemo(() => {
    const name = fName.trim().toLowerCase();
    const level = fLevel.trim();
    const notes = fNotes.trim();
    return songs.filter(
      (s: any) =>
        (!name || String(s.song_name).toLowerCase().includes(name)) &&
        (!fDifficulty || s.difficulty === fDifficulty) &&
        (!level || String(s.level) === level) &&
        (!notes || String(s.total_notes).includes(notes))
    );
  }, [songs, fName, fDifficulty, fLevel, fNotes]);

  // 壊れている可能性がある行（難易度が EXPERT/MASTER/APPEND 以外、または曲名の先頭・末尾に " が付いている）
  // 例: CSVのカンマの読み間違いで、曲名が「"Hello」、難易度が「WORLD!"」になってしまったもの
  const VALID_DIFFICULTIES = ['EXPERT', 'MASTER', 'APPEND'];
  const suspiciousSongs = useMemo(
    () =>
      songs.filter((s: any) => {
        const name = String(s.song_name ?? '');
        return !VALID_DIFFICULTIES.includes(String(s.difficulty ?? '')) || name.startsWith('"') || name.endsWith('"');
      }),
    [songs]
  );

  // 選んだ行を削除する
  const deleteSongs = async (ids: number[], label: string) => {
    if (ids.length === 0) return;
    if (!confirm(`${label}を削除しますか？（${ids.length}件）\nこの操作は元に戻せません。`)) return;

    try {
      const res = await fetch('/api/songs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setImportMessage(`🗑️ ${data.deleted ?? ids.length} 件の楽曲データを削除しました`);
        fetchSongs();
      } else {
        alert(`削除に失敗しました（${res.status}${data.error ? '：' + data.error : ''}）`);
      }
    } catch (err) {
      console.error('楽曲削除エラー:', err);
      alert('削除中にエラーが発生しました。');
    }
  };

  const hasFilter = !!(fName.trim() || fDifficulty || fLevel.trim() || fNotes.trim());
  const clearFilters = () => {
    setFName('');
    setFDifficulty('');
    setFLevel('');
    setFNotes('');
  };

  // 単体登録フォーム送信処理
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

  // CSVパース処理 (タイトル, 難易度1, レベル1, ノーツ1, 難易度2, レベル2, ノーツ2, 難易度3, レベル3, ノーツ3)
  const parseCSV = (text: string) => {
    // "Hello,WORLD!" のように、曲名にカンマが入っていても正しく読めるCSVパーサーを使う
    const rows = parseCsv(text);
    const parsedSongs: any[] = [];

    // 2行目(インデックス1)以降からデータをパース
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].map((col) => col.trim());
      const title = cols[0];
      if (!title) continue;

      // 難易度セット 1 (EXPERT等)
      if (cols[1] && cols[2]) {
        parsedSongs.push({
          songName: title,
          difficulty: cols[1].toUpperCase(),
          level: cols[2],
          notes: parseInt(cols[3], 10) || 0,
        });
      }

      // 難易度セット 2 (MASTER等)
      if (cols[4] && cols[5]) {
        parsedSongs.push({
          songName: title,
          difficulty: cols[4].toUpperCase(),
          level: cols[5],
          notes: parseInt(cols[6], 10) || 0,
        });
      }

      // 難易度セット 3 (APPEND等)
      if (cols[7] && cols[8]) {
        parsedSongs.push({
          songName: title,
          difficulty: cols[7].toUpperCase(),
          level: cols[8],
          notes: parseInt(cols[9], 10) || 0,
        });
      }
    }

    return parsedSongs;
  };

  // CSV一括インポート実行処理
  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      alert('CSVファイルを選択してください。');
      return;
    }

    setImporting(true);
    setImportMessage('');

    try {
      const text = await csvFile.text();
      const parsedSongs = parseCSV(text);

      if (parsedSongs.length === 0) {
        alert('有効な楽曲データが見つかりませんでした。ファイルフォーマットを確認してください。');
        setImporting(false);
        return;
      }

      const res = await fetch('/api/admin/songs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs: parsedSongs }),
      });

      const data = await res.json();

      if (res.ok) {
        setImportMessage(`✨ ${data.count || parsedSongs.length} 件の譜面データをインポートしました！`);
        setCsvFile(null);
        fetchSongs();
      } else {
        alert(`インポートエラー: ${data.error || '失敗しました'}`);
      }
    } catch (err) {
      console.error('CSVインポートエラー:', err);
      alert('ファイルの読み込み中にエラーが発生しました。');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080910] text-white p-8 space-y-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-black bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent">
            ⚙️ 楽曲辞書 管理者パネル
          </h1>
          <div className="flex gap-2">
            <Link
              href="/admin/jackets"
              className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-xl text-xs transition"
            >
              🖼️ ジャケット管理へ
            </Link>
            <Link
              href="/admin/home"
              className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-xl text-xs transition"
            >
              👑 管理者ホームへ
            </Link>
            <Link
              href="/"
              className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-xl text-xs transition"
            >
              ← ホームに戻る
            </Link>
          </div>
        </div>

        {importMessage && (
          <div className="p-4 rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-300 text-xs font-bold text-center">
            {importMessage}
          </div>
        )}

        {/* 1. CSV一括インポートフォーム */}
        <div className="glass-panel p-6 rounded-3xl border border-pink-500/30 bg-pink-950/10 space-y-4">
          <h2 className="font-bold text-sm text-pink-400 flex items-center space-x-2">
            <span>📁 CSVファイルから一括インポート</span>
          </h2>
          <p className="text-xs text-slate-400">
            スプレッドシートからダウンロードしたCSVファイル（<code className="text-pink-300">.csv</code>）を直接アップロードして一括登録できます。
          </p>

          <form onSubmit={handleCsvImport} className="flex flex-col md:flex-row gap-3 items-center">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-pink-600 file:text-white hover:file:bg-pink-500 cursor-pointer bg-slate-900 border border-white/10 rounded-xl"
            />
            <button
              type="submit"
              disabled={importing || !csvFile}
              className="w-full md:w-auto bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold px-8 py-2.5 rounded-xl text-xs transition shadow-lg shrink-0"
            >
              {importing ? 'インポート中...' : '一括インポート実行'}
            </button>
          </form>

          <div className="bg-slate-950 p-3 rounded-xl border border-white/5 text-[11px] text-slate-400 space-y-1">
            <span className="font-bold text-slate-300">💡 スプレッドシートCSV対応列挙順:</span>
            <div className="font-mono text-cyan-400 text-[10px] overflow-x-auto whitespace-nowrap">
              曲名, 難易度1, レベル1, ノーツ1, 難易度2, レベル2, ノーツ2, 難易度3, レベル3, ノーツ3
            </div>
          </div>
        </div>

        {/* 2. 楽曲一括登録・追加入力フォーム (手動) */}
        <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-3xl border border-white/10 space-y-5">
          <h2 className="font-bold text-sm text-slate-200">楽曲データの個別に登録・追加（後からのAPPEND追加や修正も対応）</h2>
          
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

        {/* 壊れている可能性があるデータ */}
        {suspiciousSongs.length > 0 && (
          <div className="glass-panel p-6 rounded-3xl border border-amber-500/40 bg-amber-950/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold text-sm text-amber-400">
                ⚠️ 壊れている可能性があるデータが {suspiciousSongs.length} 件あります
              </h2>
              <button
                type="button"
                onClick={() => deleteSongs(suspiciousSongs.map((s: any) => s.id), 'ここに表示されているデータすべて')}
                className="bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-500/30 font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                これらをすべて削除
              </button>
            </div>
            <p className="text-xs text-slate-400">
              難易度が EXPERT / MASTER / APPEND 以外、または曲名の先頭か末尾に「"」が付いているデータです。削除する前に、中身を確認してください。
            </p>
            <div className="max-h-[240px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400">
                  <tr className="border-b border-white/10">
                    <th className="pb-2">ID</th>
                    <th className="pb-2">曲名</th>
                    <th className="pb-2">難易度</th>
                    <th className="pb-2">レベル</th>
                    <th className="pb-2">総ノーツ数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {suspiciousSongs.slice(0, 100).map((song: any) => (
                    <tr key={song.id}>
                      <td className="py-2 font-mono text-slate-500">{song.id}</td>
                      <td className="py-2 text-white">{song.song_name}</td>
                      <td className="py-2 text-amber-300">{song.difficulty}</td>
                      <td className="py-2 text-slate-300">{song.level}</td>
                      <td className="py-2 font-mono text-pink-400">{song.total_notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {suspiciousSongs.length > 100 && (
                <p className="text-[10px] text-slate-500 pt-2">ほか {suspiciousSongs.length - 100} 件（先頭の100件だけ表示しています）</p>
              )}
            </div>
          </div>
        )}

        {/* 3. 登録済み楽曲一覧 */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-sm text-slate-200">
              登録済み楽曲一覧 ({hasFilter ? `${filteredSongs.length} / ${songs.length}` : songs.length}件)
            </h2>
            {hasFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] transition"
              >
                検索条件をクリア
              </button>
            )}
          </div>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#080910] z-10">
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-3">曲名</th>
                  <th className="pb-3">難易度</th>
                  <th className="pb-3">レベル</th>
                  <th className="pb-3">総ノーツ数</th>
                  <th className="pb-3"></th>
                </tr>
                {/* 各欄の検索 */}
                <tr className="border-b border-white/10">
                  <th className="pb-3 pr-2 font-normal">
                    <input
                      type="text"
                      value={fName}
                      onChange={(e) => setFName(e.target.value)}
                      placeholder="曲名で検索"
                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </th>
                  <th className="pb-3 pr-2 font-normal">
                    <select
                      value={fDifficulty}
                      onChange={(e) => setFDifficulty(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">すべて</option>
                      {difficultyOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="pb-3 pr-2 font-normal">
                    <input
                      type="number"
                      value={fLevel}
                      onChange={(e) => setFLevel(e.target.value)}
                      placeholder="レベル"
                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </th>
                  <th className="pb-3 font-normal">
                    <input
                      type="number"
                      value={fNotes}
                      onChange={(e) => setFNotes(e.target.value)}
                      placeholder="ノーツ数（一部でも可）"
                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">読み込み中...</td>
                  </tr>
                ) : filteredSongs.length === 0 && songs.length > 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      条件に当てはまる楽曲がありません
                    </td>
                  </tr>
                ) : songs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      まだ楽曲が登録されていません。CSV一括インポートまたは上のフォームから追加してください！
                    </td>
                  </tr>
                ) : (
                  filteredSongs.map((song: any) => (
                    <tr key={song.id} className="hover:bg-white/5">
                      <td className="py-3 font-bold text-white">{song.song_name}</td>
                      <td className="py-3 text-cyan-300 font-semibold">{song.difficulty}</td>
                      <td className="py-3 text-slate-300">{song.level}</td>
                      <td className="py-3 font-mono text-pink-400">{song.total_notes}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => deleteSongs([song.id], `「${song.song_name}（${song.difficulty}）」`)}
                          className="bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-500/30 font-bold px-2.5 py-1 rounded-lg text-[10px] transition"
                        >
                          削除
                        </button>
                      </td>
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