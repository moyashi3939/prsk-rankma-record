'use client';

import { useCallback, useEffect, useState } from 'react';

interface Stats {
  accounts: number;
  guests: number;
  matches: number;
  active24h: number;
  active7d: number;
  guestActive7d: number;
  tokens: number;
  pending: number;
  songs: number;
  jacketSongs: number;
  recent: { account: string; updatedAt: string; matches: number }[];
  server: { uptimeSec: number; rssMB: number; node: string };
}

const formatUptime = (sec: number) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d > 0 ? `${d}日 ` : ''}${h}時間 ${m}分`;
};

const formatTime = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function Card({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4">
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className={`text-3xl font-black font-mono mt-1 ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// 管理者ホームに出す、アカウント数・利用状況・サーバーの状態（30秒ごとに、自動で更新）
export default function AdminStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!res.ok) {
        setError(`取得に失敗しました（${res.status}）`);
        return;
      }
      setStats(await res.json());
      setError('');
      setUpdatedAt(new Date());
    } catch (err) {
      console.error('統計の取得に失敗:', err);
      setError('取得に失敗しました（サーバーにつながりません）');
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-sm text-white">📊 アカウント・利用状況</h2>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          {updatedAt && <span>更新: {updatedAt.toLocaleTimeString('ja-JP')}</span>}
          <button
            type="button"
            onClick={load}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] transition"
          >
            今すぐ更新
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="登録アカウント数（Googleログイン）" value={stats.accounts} accent="text-cyan-300" />
            <Card label="ゲスト（ログインなし）" value={stats.guests} sub={`直近7日に動いた: ${stats.guestActive7d}`} />
            <Card label="直近24時間に動いたアカウント" value={stats.active24h} accent="text-pink-300" />
            <Card label="直近7日に動いたアカウント" value={stats.active7d} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="対戦記録の総数" value={stats.matches} />
            <Card label="ショートカットのトークン発行数" value={stats.tokens} sub={`確認待ちの画像: ${stats.pending}`} />
            <Card label="楽曲数" value={stats.songs} />
            <Card label="ジャケット登録済みの曲" value={stats.jacketSongs} sub={`未登録: ${Math.max(0, stats.songs - stats.jacketSongs)}`} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-[11px] font-bold text-slate-300">最近動いたアカウント（メールアドレスは、一部を伏せています）</p>
              {stats.recent.length === 0 ? (
                <p className="text-[11px] text-slate-500">まだありません</p>
              ) : (
                <ul className="space-y-1">
                  {stats.recent.map((r, i) => (
                    <li key={`${r.account}-${i}`} className="flex justify-between gap-3 text-[11px]">
                      <span className="text-slate-200 font-mono truncate">{r.account}</span>
                      <span className="text-slate-500 shrink-0">
                        {formatTime(r.updatedAt)}　{r.matches}戦
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-[11px] font-bold text-slate-300">サーバーの状態</p>
              <ul className="space-y-1 text-[11px] text-slate-300">
                <li className="flex justify-between"><span className="text-slate-500">稼働時間</span><span className="font-mono">{formatUptime(stats.server.uptimeSec)}</span></li>
                <li className="flex justify-between"><span className="text-slate-500">メモリ使用量</span><span className="font-mono">{stats.server.rssMB} MB</span></li>
                <li className="flex justify-between"><span className="text-slate-500">Node.js</span><span className="font-mono">{stats.server.node}</span></li>
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
