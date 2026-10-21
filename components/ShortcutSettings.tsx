'use client';

import { useEffect, useState } from 'react';

interface TokenStatus {
  hasToken: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ja-JP');
};

// iOSショートカット連携の設定（トークンの発行・無効化と、ショートカットの作り方）
// ログイン中のユーザーにだけ表示する
export default function ShortcutSettings() {
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null); // 発行した直後だけ表示する
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [origin, setOrigin] = useState('');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/tokens', { cache: 'no-store' });
      if (res.ok) setStatus(await res.json());
    } catch (err) {
      console.error('トークン状態の取得に失敗:', err);
    }
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    fetchStatus();
  }, []);

  const handleIssue = async () => {
    if (status?.hasToken && !confirm('トークンを再発行しますか？\n古いトークンは使えなくなるので、ショートカットのトークンも入れ替えてください。')) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/tokens', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(`❌ 発行に失敗しました（${res.status}${data.error ? '：' + data.error : ''}）`);
        return;
      }
      setNewToken(data.token);
      await fetchStatus();
    } catch (err) {
      console.error(err);
      setMessage('❌ 発行中にエラーが発生しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm('トークンを無効にしますか？\nショートカットからの送信ができなくなります。')) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/tokens', { method: 'DELETE' });
      if (res.ok) {
        setNewToken(null);
        setMessage('🗑️ トークンを無効にしました。');
        await fetchStatus();
      } else {
        setMessage(`❌ 無効化に失敗しました（${res.status}）`);
      }
    } catch (err) {
      console.error(err);
      setMessage('❌ 無効化中にエラーが発生しました。');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`📋 ${label}をコピーしました`);
    } catch {
      setMessage('コピーできませんでした。欄を長押し（クリック）して、手動でコピーしてください。');
    }
  };

  const uploadUrl = `${origin}/api/shortcut/upload`;
  const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');

  return (
    <div className="glass-panel p-6 rounded-3xl border border-emerald-500/30 bg-emerald-950/10 space-y-4">
      <h3 className="text-lg font-black text-emerald-400 flex items-center space-x-2">
        <span>📱 iOSショートカット連携</span>
      </h3>
      <p className="text-xs text-slate-400">
        iPhone の「ショートカット」から、リザルト画面のスクショをこのアプリに送れます。送った画像は「受信箱」に届き、
        記録画面で取り込んで、1枚ずつ確認しながら登録できます。トークンは、ログインしているあなた専用です。
      </p>

      {message && <p className="text-xs font-bold text-emerald-300">{message}</p>}

      {/* トークン */}
      <div className="space-y-3">
        <div className="text-xs text-slate-300 space-y-1">
          <p>
            状態：{status?.hasToken ? <span className="text-emerald-400 font-bold">発行済み</span> : <span className="text-slate-500">未発行</span>}
          </p>
          {status?.hasToken && (
            <p className="text-[10px] text-slate-500">
              発行: {formatDate(status.createdAt)} ／ 最後に使った日時: {formatDate(status.lastUsedAt)}
            </p>
          )}
        </div>

        {newToken && (
          <div className="bg-black/40 border border-emerald-500/40 rounded-xl p-3 space-y-2">
            <p className="text-[11px] text-amber-300 font-bold">
              ⚠️ このトークンは、いま1度しか表示されません。コピーして、ショートカットに貼り付けてください。
            </p>
            <input
              readOnly
              value={newToken}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono text-emerald-200"
            />
            <button
              type="button"
              onClick={() => copy(newToken, 'トークン')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-xs transition"
            >
              トークンをコピー
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleIssue}
            disabled={busy}
            className="bg-emerald-700/60 hover:bg-emerald-600/70 disabled:opacity-50 border border-emerald-500/40 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
          >
            {status?.hasToken ? 'トークンを再発行する' : 'トークンを発行する'}
          </button>
          {status?.hasToken && (
            <button
              type="button"
              onClick={handleRevoke}
              disabled={busy}
              className="bg-red-950/40 hover:bg-red-900/50 disabled:opacity-50 text-red-300 border border-red-500/30 font-bold px-4 py-2 rounded-xl text-xs transition"
            >
              無効にする
            </button>
          )}
        </div>
      </div>

      {/* 送信先URL */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold text-slate-300">送信先のURL</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={uploadUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-200"
          />
          <button
            type="button"
            onClick={() => copy(uploadUrl, 'URL')}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-2 rounded-lg text-xs transition shrink-0"
          >
            コピー
          </button>
        </div>
        {isLocalhost && (
          <p className="text-[10px] text-amber-300">
            ⚠️ いまは localhost で開いているので、このURLは iPhone からは届きません。同じWi-Fiにつないだ状態で、PCのIPアドレス
            （例: http://192.168.x.x:3000/api/shortcut/upload）に置き換えてください。公開したあとは、公開先のURLを使います。
          </p>
        )}
      </div>

      {/* ショートカットの作り方 */}
      <details className="bg-black/30 border border-white/10 rounded-xl p-4 text-xs text-slate-300">
        <summary className="cursor-pointer font-bold text-emerald-300">ショートカットの作り方</summary>
        <ol className="list-decimal pl-5 mt-3 space-y-2 leading-relaxed">
          <li>iPhone の「ショートカット」アプリで、新しいショートカットを作ります。</li>
          <li>
            アクション「<b>スクリーンショットを撮る</b>」を追加します（写真から送りたいときは、共有シートから画像を受け取る形にします）。
          </li>
          <li>
            アクション「<b>イメージを変換</b>」を追加して、形式を <b>JPEG</b> にします（HEIC のままだと送れません）。
          </li>
          <li>
            アクション「<b>URLの内容を取得</b>」を追加して、次のように設定します。
            <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-400">
              <li>URL：上の「送信先のURL」</li>
              <li>方法：<b>POST</b></li>
              <li>ヘッダ：名前 <code>Authorization</code>、値 <code>Bearer ＋ 空白 ＋ トークン</code></li>
              <li>本文を要求：<b>フォーム</b> → 「新規フィールドを追加」→ <b>ファイル</b>、キー <code>image</code>、値「変換されたイメージ」</li>
            </ul>
          </li>
          <li>（任意）アクション「<b>通知を表示</b>」で、結果を表示します。</li>
          <li>背面タップやアクションボタンに、このショートカットを割り当てます。</li>
        </ol>
        <p className="mt-3 text-[10px] text-slate-500">
          ※ アクションの表示名は、iOS のバージョンで少し違うことがあります。送った画像は、記録画面の「📥 ショートカットから届いた画像」から取り込めます。
        </p>
      </details>
    </div>
  );
}
