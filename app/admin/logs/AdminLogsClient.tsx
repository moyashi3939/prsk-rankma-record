'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

interface LogEntry {
  id: number;
  time: string;
  level: 'error' | 'warn' | 'info';
  message: string;
}

const MAX_LINES = 1000; // 画面に出す最大の行数

const LEVEL_STYLE: Record<LogEntry['level'], { badge: string; text: string; label: string }> = {
  error: { badge: 'bg-red-600/80 text-white', text: 'text-red-200', label: 'ERROR' },
  warn: { badge: 'bg-amber-500/80 text-black', text: 'text-amber-200', label: 'WARN' },
  info: { badge: 'bg-cyan-700/80 text-white', text: 'text-slate-200', label: 'INFO' },
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ja-JP', { hour12: false });
};

// サーバーのエラーログを、リアルタイムに流す画面（Server-Sent Events）
export default function AdminLogsClient() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState<'all' | 'problems' | 'error'>('all');
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');

  const pausedRef = useRef(false);
  const bufferRef = useRef<LogEntry[]>([]); // 一時停止中に届いたもの
  const lastIdRef = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  pausedRef.current = paused;

  // ログを受け取る（切れたときは、ブラウザが自動で、続きから再接続する）
  useEffect(() => {
    const es = new EventSource('/api/admin/logs/stream');

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      let entry: LogEntry;
      try {
        entry = JSON.parse(e.data);
      } catch {
        return;
      }
      if (entry.id <= lastIdRef.current) return; // すでに受け取ったもの
      lastIdRef.current = entry.id;

      if (pausedRef.current) {
        bufferRef.current.push(entry);
        return;
      }
      setEntries((prev) => [...prev, entry].slice(-MAX_LINES));
    };

    return () => es.close();
  }, []);

  // 再開したら、止まっていた間のログを、まとめて出す
  useEffect(() => {
    if (!paused && bufferRef.current.length > 0) {
      const buffered = bufferRef.current;
      bufferRef.current = [];
      setEntries((prev) => [...prev, ...buffered].slice(-MAX_LINES));
    }
  }, [paused]);

  // 新しいログが来たら、いちばん下まで自動でスクロール
  useEffect(() => {
    if (autoScroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (levelFilter === 'all' || (levelFilter === 'error' ? e.level === 'error' : e.level !== 'info')) &&
        (!kw || e.message.toLowerCase().includes(kw))
    );
  }, [entries, levelFilter, keyword]);

  const errorCount = entries.filter((e) => e.level === 'error').length;
  const warnCount = entries.filter((e) => e.level === 'warn').length;

  const handleClearServer = async () => {
    if (!confirm('サーバーに貯まっているログを、すべて消しますか？（画面のログも消えます）')) return;
    try {
      const res = await fetch('/api/admin/logs', { method: 'DELETE' });
      if (res.ok) {
        setEntries([]);
        bufferRef.current = [];
        setMessage('🗑️ サーバーのログを消しました');
      } else {
        setMessage(`❌ 削除に失敗しました（${res.status}）`);
      }
    } catch {
      setMessage('❌ 削除中にエラーが発生しました');
    }
  };

  const handleCopy = async () => {
    const text = visible.map((e) => `[${e.time}] ${e.level.toUpperCase()} ${e.message}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`📋 ${visible.length} 行をコピーしました`);
    } catch {
      setMessage('コピーできませんでした');
    }
  };

  return (
    <div className="min-h-screen bg-[#080910] text-white pb-10 pt-8 px-4 md:px-6">
      <main className="max-w-5xl mx-auto space-y-4">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent">
              📜 サーバーログ（リアルタイム）
            </h1>
            <p className="text-[11px] text-slate-400 mt-1">
              サーバーで起きたエラー・警告・ショートカットの受信などが、ここに流れます（サーバーを再起動すると、消えます）。
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/home" className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-xl text-xs transition">
              👑 管理者ホームへ
            </Link>
          </div>
        </div>

        {/* 状態・操作 */}
        <div className="glass-panel border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className={`font-bold ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
              {connected ? '🟢 接続中（リアルタイム）' : '🔴 切断（再接続しています…）'}
            </span>
            <span className="text-red-300">エラー {errorCount}</span>
            <span className="text-amber-300">警告 {warnCount}</span>
            <span className="text-slate-500">表示 {visible.length} / {entries.length} 行</span>
            {paused && bufferRef.current.length > 0 && <span className="text-amber-300">一時停止中</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className={`font-bold px-3 py-2 rounded-lg text-[11px] transition ${paused ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
            >
              {paused ? '▶ 再開' : '⏸ 一時停止'}
            </button>
            <button type="button" onClick={() => setEntries([])} className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-2 rounded-lg text-[11px] transition">
              画面をクリア
            </button>
            <button type="button" onClick={handleClearServer} className="bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-500/30 font-bold px-3 py-2 rounded-lg text-[11px] transition">
              サーバーのログも消す
            </button>
            <button type="button" onClick={handleCopy} className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-2 rounded-lg text-[11px] transition">
              表示中をコピー
            </button>

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as 'all' | 'problems' | 'error')}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[11px] outline-none"
            >
              <option value="all">すべて</option>
              <option value="problems">エラーと警告</option>
              <option value="error">エラーだけ</option>
            </select>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="文字で絞り込み"
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[11px] outline-none w-40"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
              自動スクロール
            </label>
          </div>

          {message && <p className="text-[11px] text-cyan-300">{message}</p>}
        </div>

        {/* ログ */}
        <div
          ref={boxRef}
          className="bg-black/70 border border-white/10 rounded-2xl p-3 h-[60vh] overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1"
        >
          {visible.length === 0 ? (
            <p className="text-slate-500 p-2">
              {connected ? 'ログはまだありません。エラーが起きると、ここに流れます。' : 'サーバーにつながっていません。管理者でログインしているか確認してください。'}
            </p>
          ) : (
            visible.map((e) => {
              const st = LEVEL_STYLE[e.level];
              return (
                <div key={e.id} className="flex gap-2 items-start">
                  <span className="text-slate-500 shrink-0">{formatTime(e.time)}</span>
                  <span className={`shrink-0 px-1.5 rounded text-[9px] font-bold leading-4 mt-0.5 ${st.badge}`}>{st.label}</span>
                  <pre className={`whitespace-pre-wrap break-all font-mono flex-1 ${st.text}`}>{e.message}</pre>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
