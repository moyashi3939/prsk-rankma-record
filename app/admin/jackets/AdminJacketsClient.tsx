'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { readJacket, type JacketHash } from '@/lib/resultOcr';

interface Chart {
  difficulty: string;
  level: string | number;
  totalNotes: string | number;
}

interface JacketItem {
  id: number;
  thumb: string | null;
}

interface JacketRow {
  songName: string;
  charts: Chart[];
  jackets: JacketItem[]; // 登録済みのジャケット（1つの曲に、複数あることがある）
  expected: number; // ジャケットが、何種類あるはずか
}

export default function AdminJacketsPage() {
  const [rows, setRows] = useState<JacketRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 各欄の検索
  const [fName, setFName] = useState('');
  const [fDifficulty, setFDifficulty] = useState('');
  const [fLevel, setFLevel] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fStatus, setFStatus] = useState<'all' | 'unregistered' | 'registered' | 'incomplete'>('all');

  const [selected, setSelected] = useState(''); // 登録する曲
  const [jacket, setJacket] = useState<JacketHash | null>(null); // 画像から読み取ったジャケット
  const [fileKey, setFileKey] = useState(0); // 画像の入力欄をリセットするための値
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // 曲一覧とジャケットの登録状況を取得
  const fetchRows = async (): Promise<JacketRow[]> => {
    try {
      const res = await fetch('/api/admin/jackets', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) {
        setRows(data);
        return data;
      }
    } catch (err) {
      console.error('取得失敗:', err);
    } finally {
      setLoading(false);
    }
    return [];
  };

  useEffect(() => {
    fetchRows();
  }, []);

  // 一覧にある難易度（絞り込みの選択肢）
  const difficultyOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.charts.map((c) => c.difficulty)))).filter(Boolean),
    [rows]
  );

  // 難易度・レベル・ノーツ数は「同じ譜面」が全部の条件に当てはまる曲だけを表示する
  const filtered = useMemo(() => {
    const name = fName.trim().toLowerCase();
    const level = fLevel.trim();
    const notes = fNotes.trim();
    const needChart = !!(fDifficulty || level || notes);

    const chartMatches = (c: Chart) =>
      (!fDifficulty || c.difficulty === fDifficulty) &&
      (!level || String(c.level) === level) &&
      (!notes || String(c.totalNotes).includes(notes));

    return rows.filter(
      (r) =>
        (fStatus === 'all' ||
          (fStatus === 'registered' && r.jackets.length > 0) ||
          (fStatus === 'unregistered' && r.jackets.length === 0) ||
          (fStatus === 'incomplete' && r.jackets.length < r.expected)) &&
        (!name || r.songName.toLowerCase().includes(name)) &&
        (!needChart || r.charts.some(chartMatches))
    );
  }, [rows, fName, fDifficulty, fLevel, fNotes, fStatus]);

  const hasFilter = !!(fName.trim() || fDifficulty || fLevel.trim() || fNotes.trim() || fStatus !== 'all');
  const clearFilters = () => {
    setFName('');
    setFDifficulty('');
    setFLevel('');
    setFNotes('');
    setFStatus('all');
  };

  const registeredCount = rows.filter((r) => r.jackets.length > 0).length;
  const incompleteCount = rows.filter((r) => r.jackets.length < r.expected).length; // 登録が足りない曲（未登録も含む）
  const selectedRow = rows.find((r) => r.songName === selected) || null;

  // 画像を選んだら、ジャケットの部分だけを読み取る（数字のOCRはしないので速い）
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage('');
    try {
      setJacket(await readJacket(file));
    } catch (err) {
      console.error(err);
      setJacket(null);
      setMessage('❌ 画像を読み込めませんでした。');
    }
  };

  // 選んだ曲に、ジャケットを登録する
  //  ・まだ登録されていない種類なら、追加される（バージョンで変わる曲は、種類ごとに登録する）
  //  ・すでに登録されているものと同じジャケットなら、新しい画像で置き換わる
  const handleRegister = async (replaceId?: number) => {
    if (!selected || !jacket) return;

    setSaving(true);
    try {
      const res = await fetch('/api/songs/jackets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songName: selected, hex: jacket.hex, thumb: jacket.preview, replaceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(`❌ 登録に失敗しました（${res.status}${data.error ? '：' + data.error : ''}）`);
        return;
      }
      if (!data.saved) {
        setMessage(
          data.reason === 'limit'
            ? '⚠️ この曲に登録できるジャケットの数の上限です。不要なものを、削除してください。'
            : '⚠️ 登録できませんでした。'
        );
        return;
      }

      setMessage(
        data.replaced
          ? `✅ 「${selected}」の、同じジャケットを、新しい画像で置き換えました`
          : `✅ 「${selected}」のジャケットを、1種類追加しました`
      );
      setJacket(null);
      setFileKey((k) => k + 1);

      // 一覧を更新する。この曲に、まだ登録が足りなければ、そのまま同じ曲を選んでおく（次の種類を続けて登録できる）。
      // 足りていれば、次の「登録が足りない曲」を、自動で選ぶ
      const fresh = await fetchRows();
      const cur = fresh.find((r) => r.songName === selected);
      if (cur && cur.jackets.length < cur.expected) {
        setMessage(
          (m) => `${m}。この曲は、あと ${cur.expected - cur.jackets.length} 種類あります。次の種類の画像を選んでください`
        );
      } else {
        const idx = fresh.findIndex((r) => r.songName === selected);
        const next = fresh.slice(idx + 1).find((r) => r.jackets.length < r.expected);
        setSelected(next ? next.songName : '');
      }
    } catch (err) {
      console.error(err);
      setMessage('❌ 登録中にエラーが発生しました。');
    } finally {
      setSaving(false);
    }
  };

  // ジャケットを1つ消す
  const handleDeleteOne = async (songName: string, id: number) => {
    if (!confirm(`「${songName}」の、このジャケット1つを削除しますか？`)) return;
    try {
      const res = await fetch(`/api/songs/jackets?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setMessage(`❌ 削除に失敗しました（${res.status}）`);
        return;
      }
      setMessage(`🗑️ 「${songName}」のジャケットを1つ削除しました`);
      await fetchRows();
    } catch (err) {
      console.error(err);
      setMessage('❌ 削除中にエラーが発生しました。');
    }
  };

  // その曲のジャケットを、すべて消す
  const handleDeleteAll = async (songName: string) => {
    if (!confirm(`「${songName}」のジャケット登録を、すべて削除しますか？`)) return;
    try {
      const res = await fetch(`/api/songs/jackets?name=${encodeURIComponent(songName)}`, { method: 'DELETE' });
      if (!res.ok) {
        setMessage(`❌ 削除に失敗しました（${res.status}）`);
        return;
      }
      setMessage(`🗑️ 「${songName}」のジャケット登録を、すべて削除しました`);
      await fetchRows();
    } catch (err) {
      console.error(err);
      setMessage('❌ 削除中にエラーが発生しました。');
    }
  };

  return (
    <div className="min-h-screen bg-[#080910] text-white p-8 space-y-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-black bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent">
            🖼️ ジャケット管理
          </h1>
          <div className="flex gap-2">
            <Link
              href="/admin/home"
              className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-xl text-xs transition"
            >
              👑 管理者ホームへ
            </Link>
            <Link
              href="/admin/songs"
              className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-xl text-xs transition"
            >
              🎵 楽曲管理へ
            </Link>
          </div>
        </div>

        {message && (
          <div className="p-4 rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-300 text-xs font-bold text-center">
            {message}
          </div>
        )}

        {/* 1. ジャケットを登録する */}
        <div className="glass-panel p-6 rounded-3xl border border-cyan-500/30 bg-cyan-950/10 space-y-4">
          <h2 className="font-bold text-sm text-cyan-400">📷 ジャケットを1曲ずつ登録</h2>
          <p className="text-xs text-slate-400">
            下の一覧から曲を選んで、その曲のリザルト画像を選ぶと、画像の中のジャケットが読み取られます。内容を確認して「登録」を押してください。
            バージョンなどでジャケットが変わる曲は、<b className="text-slate-200">種類ごとに、別の画像で登録</b>してください（同じ曲に、複数のジャケットを登録できます）。
            登録が足りない曲があるうちは、次の「登録が足りない曲」が、自動で選ばれます。
          </p>

          <div className="flex flex-col md:flex-row gap-4 items-start">
            {/* 曲 */}
            <div className="flex-1 w-full space-y-2">
              <p className="text-[10px] text-slate-500 font-bold">登録する曲</p>
              <div className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold min-h-[44px]">
                {selected ? selected : <span className="text-slate-500 font-normal">一覧から曲を選んでください</span>}
              </div>
              {selectedRow && (
                <p className={`text-[10px] ${selectedRow.jackets.length < selectedRow.expected ? 'text-amber-400' : 'text-emerald-400'}`}>
                  登録済み {selectedRow.jackets.length} 種類 / あるはずの種類 {selectedRow.expected}
                  {selectedRow.expected > 1 && '（ジャケットが複数ある曲です）'}
                </p>
              )}
            </div>

            {/* 画像 */}
            <div className="flex-1 w-full space-y-2">
              <p className="text-[10px] text-slate-500 font-bold">リザルト画像</p>
              <input
                key={fileKey}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-white/10 file:text-white file:font-bold hover:file:bg-white/20"
              />
            </div>
          </div>

          {/* 確認 */}
          {(jacket || (selectedRow && selectedRow.jackets.length > 0)) && (
            <div className="flex flex-wrap items-start gap-5 pt-2">
              {selectedRow && selectedRow.jackets.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500">いまの登録（{selectedRow.jackets.length} 種類）</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedRow.jackets.map((j) => (
                      <div key={j.id} className="relative text-center space-y-1">
                        {j.thumb ? (
                          <img src={j.thumb} alt="登録済みのジャケット" className="w-20 h-20 rounded-xl border border-white/10" />
                        ) : (
                          <div className="w-20 h-20 rounded-xl border border-dashed border-white/10 flex items-center justify-center text-[9px] text-slate-600">
                            画像なし
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteOne(selectedRow.songName, j.id)}
                          aria-label="このジャケットを削除"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold leading-none"
                        >
                          ×
                        </button>
                        {jacket && (
                          <button
                            type="button"
                            onClick={() => handleRegister(j.id)}
                            disabled={saving}
                            className="block w-full bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white font-bold px-2 py-1 rounded-lg text-[10px] transition"
                          >
                            これと置き換え
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {jacket && (
                <div className="text-center space-y-1">
                  <p className="text-[10px] text-cyan-400">今回の画像から読み取ったもの</p>
                  <img src={jacket.preview} alt="読み取ったジャケット" className="w-20 h-20 rounded-xl border border-cyan-500/40" />
                </div>
              )}
              <p className="text-[10px] text-slate-500 flex-1 min-w-[12rem]">
                ジャケット以外が写っているときは、位置が合っていません。登録せずに、<code>lib/resultOcr.ts</code> の
                <code> JACKET_REGION</code> を調整してください。
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleRegister()}
            disabled={!selected || !jacket || saving}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg"
          >
            {saving ? '登録中...' : selectedRow && selectedRow.jackets.length > 0 ? '新しい種類として追加する' : '登録する'}
          </button>
        </div>

        {/* 2. 曲の一覧 */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-slate-900/40 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold text-sm text-white">
              🎵 曲の一覧
              <span className="ml-2 text-xs text-slate-400 font-normal">
                登録済み {registeredCount} / 全 {rows.length} 曲
                {incompleteCount > 0 && ` ／ 登録が足りない ${incompleteCount} 曲`}
                {hasFilter && `（表示 ${filtered.length} 曲）`}
              </span>
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

          {/* 各欄の検索 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <input
              type="text"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="曲名で検索"
              className="col-span-2 md:col-span-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-500/50"
            />
            <select
              value={fDifficulty}
              onChange={(e) => setFDifficulty(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-500/50"
            >
              <option value="">難易度：すべて</option>
              {difficultyOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={fLevel}
              onChange={(e) => setFLevel(e.target.value)}
              placeholder="レベル"
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-500/50"
            />
            <input
              type="number"
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
              placeholder="ノーツ数（一部でも可）"
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-500/50"
            />
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value as 'all' | 'unregistered' | 'registered' | 'incomplete')}
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-500/50"
            >
              <option value="all">登録状況：すべて</option>
              <option value="unregistered">未登録だけ</option>
              <option value="registered">登録済みだけ</option>
              <option value="incomplete">登録が足りない曲だけ（複数ジャケットの曲を含む）</option>
            </select>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500 text-center py-6">読み込み中...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">該当する曲がありません</p>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {filtered.map((r) => (
                <div
                  key={r.songName}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                    r.songName === selected ? 'border-cyan-500/60 bg-cyan-950/20' : 'border-white/5 bg-black/20'
                  }`}
                >
                  <div className="flex gap-1.5 shrink-0">
                    {r.jackets.length > 0 ? (
                      r.jackets.slice(0, 3).map((j) =>
                        j.thumb ? (
                          <img key={j.id} src={j.thumb} alt="" className="w-12 h-12 rounded-lg border border-white/10" />
                        ) : (
                          <div
                            key={j.id}
                            className="w-12 h-12 rounded-lg border border-dashed border-white/10 flex items-center justify-center text-[9px] text-slate-600"
                          >
                            登録済
                          </div>
                        )
                      )
                    ) : (
                      <div className="w-12 h-12 rounded-lg border border-dashed border-white/10 flex items-center justify-center text-[9px] text-slate-600">
                        未登録
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{r.songName}</p>
                    <p
                      className={`text-[10px] ${
                        r.jackets.length === 0
                          ? 'text-slate-500'
                          : r.jackets.length < r.expected
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {r.jackets.length === 0
                        ? 'ジャケット未登録'
                        : r.jackets.length < r.expected
                        ? `⚠️ ${r.jackets.length} / ${r.expected} 種類（あと ${r.expected - r.jackets.length} 種類）`
                        : `✅ 登録済み${r.expected > 1 ? ` ${r.jackets.length} / ${r.expected} 種類` : ''}`}
                    </p>
                    {r.charts.length > 0 && (
                      <p className="text-[10px] text-slate-500 truncate">
                        {r.charts.map((c) => `${c.difficulty} Lv.${c.level}（${c.totalNotes}）`).join(' / ')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(r.songName);
                      setMessage('');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] transition shrink-0"
                  >
                    {r.jackets.length === 0 ? '登録' : '追加・変更'}
                  </button>
                  {r.jackets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAll(r.songName)}
                      className="bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-500/30 font-bold px-3 py-1.5 rounded-lg text-[11px] transition shrink-0"
                    >
                      全削除
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
