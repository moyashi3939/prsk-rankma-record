'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ShortcutSettings from '@/components/ShortcutSettings';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    userName: '',
    customId: '',
    userId: '',
    userEmail: '',
    isAdmin: false,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setSettings(data);
      })
      .catch((err) => console.error('設定ロードエラー:', err));

    fetchFollowing();

    // Googleログイン後のリダイレクト結果を表示
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'success') {
      setMessage('✅ Googleアカウントでログインしました！');
    } else if (params.get('error')) {
      setMessage(
        params.get('error') === 'auth_failed'
          ? '❌ Googleログインに失敗しました（キャンセル、またはリダイレクトURIの設定を確認してください）。'
          : '❌ ログイン処理中にサーバーエラーが発生しました。'
      );
    }
    if (params.has('login') || params.has('error')) {
      window.history.replaceState(null, '', '/settings');
    }
  }, []);

  const fetchFollowing = () => {
    fetch('/api/users/search?type=following')
      .then((res) => res.json())
      .then((data) => {
        if (data.users) setFollowingList(data.users);
      })
      .catch((err) => console.error('フォロー中リスト取得エラー:', err));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setMessage('✨ 設定を正常に保存しました！');
      } else {
        setMessage('❌ 保存に失敗しました。');
      }
    } catch (err) {
      setMessage('❌ 通信エラーが発生しました。');
    } finally {
      setSaving(false);
    }
  };

  // Google認証によるログイン・アカウント登録
  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  // ログアウト処理
  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return;

    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        alert('ログアウトしました。');
        window.location.reload();
      }
    } catch (err) {
      alert('ログアウト処理中にエラーが発生しました。');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.users || []);
    } catch (err) {
      console.error('検索エラー:', err);
    }
  };

  const handleFollow = async (targetCustomId: string) => {
    try {
      const res = await fetch('/api/users/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCustomId }),
      });
      if (res.ok) {
        alert(`@${targetCustomId} をフォローしました！`);
        fetchFollowing();
      }
    } catch (err) {
      alert('フォローに失敗しました。');
    }
  };

  const handleResetData = async () => {
    const confirmInput = prompt('【警告】すべての対戦ログとランク進捗が消去されます。\n実行する場合は「RESET」と入力してください。');
    if (confirmInput !== 'RESET') return;

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_all_data' }),
      });

      if (res.ok) {
        alert('データを初期化しました。');
        window.location.href = '/';
      } else {
        // 失敗したときも画面で分かるようにする
        const data = await res.json().catch(() => ({}));
        alert(`初期化に失敗しました（${res.status}）${data.error ? '：' + data.error : ''}\nターミナルのログを確認してください。`);
      }
    } catch (err) {
      alert('エラーが発生しました。');
    }
  };

  return (
    <div className="min-h-screen bg-[#080910] text-white pb-16 pt-8 px-6">
      <main className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center border-b border-white/10 pb-4">
          <div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
              USER SETTINGS
            </h1>
            <p className="text-xs text-slate-400 mt-1">プロフィール設定・アカウント連携・フレンド管理</p>
          </div>
          <div className="flex gap-2">
            {settings.isAdmin && (
              <Link
                href="/admin/home"
                className="bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border border-purple-500/40 font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                👑 管理者ホームへ
              </Link>
            )}
            <Link href="/" className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs transition">
              ← ホームに戻る
            </Link>
          </div>
        </div>

        {message && (
          <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold text-center">
            {message}
          </div>
        )}

        {/* 🌐 アカウント連携 / ログイン・ログアウト セクション */}
        <div className="glass-panel p-6 rounded-3xl border border-cyan-500/30 bg-cyan-950/10 space-y-4">
          <h3 className="text-lg font-black text-cyan-400 flex items-center space-x-2">
            <span>🌐 アカウント連携 (マルチデバイス同期)</span>
          </h3>

          {settings.userEmail ? (
            /* ログイン済み表示 */
            <div className="space-y-3">
              <p className="text-xs text-slate-300">
                現在、Googleアカウントでログインしています。どの端末からアクセスしてもデータが自動同期されます。
              </p>
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-mono">ログイン中のアカウント</span>
                    <span className="text-sm font-bold text-white font-mono">{settings.userEmail}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 font-bold px-5 py-2 rounded-xl text-xs transition shrink-0"
                >
                  ログアウト
                </button>
              </div>
            </div>
          ) : (
            /* 未ログイン表示 */
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Googleアカウントでログイン・新規登録すると、どの端末やブラウザからでもあなたの戦績データやプロフィールにアクセスできます。
              </p>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-6 py-3 rounded-xl text-xs transition shadow-lg shadow-cyan-600/20 flex items-center gap-2"
              >
                <span>🌐 Googleアカウントでログイン / アカウント登録</span>
              </button>
            </div>
          )}
        </div>

        {/* 👤 プレイヤープロフィール設定 */}
        <form onSubmit={handleSave} className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
            <h3 className="text-lg font-black text-pink-400 flex items-center space-x-2">
              <span>👤 プレイヤープロフィール & 自由ID設定</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">ユーザー名 (表示名)</label>
                <input
                  type="text"
                  value={settings.userName}
                  onChange={(e) => setSettings({ ...settings, userName: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">カスタムID (例: @moyashi)</label>
                <input
                  type="text"
                  value={settings.customId}
                  onChange={(e) => setSettings({ ...settings, customId: e.target.value })}
                  placeholder="moyashi"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-cyan-400 font-mono text-xs focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">プロセカゲーム内ID</label>
                <input
                  type="text"
                  value={settings.userId}
                  onChange={(e) => setSettings({ ...settings, userId: e.target.value })}
                  placeholder="1000200030"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:border-pink-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-black py-3 px-8 rounded-xl transition shadow-lg shadow-pink-600/30 text-xs tracking-wider"
            >
              {saving ? '保存中...' : '設定を保存する'}
            </button>
          </div>
        </form>

        {/* 📱 iOSショートカット連携（ログイン中のみ） */}
        {settings.userEmail && <ShortcutSettings />}

        {/* ゲスト向けの案内：ログインすると、データを引き継いで、他の端末でも使える */}
        {!settings.userEmail && (
          <div className="glass-panel p-6 rounded-3xl border border-purple-500/30 bg-purple-950/10 space-y-2">
            <h3 className="text-lg font-black text-purple-400 flex items-center space-x-2">
              <span>🔑 他の端末でも使いたいとき</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              いまはログインしていないため、この端末の中だけのデータです。Googleアカウントでログインすると、
              <b className="text-slate-200">この端末の対戦記録・ランクが、そのままアカウントに引き継がれ</b>、
              他の端末でも、ログインするだけで同じデータを使えます。
            </p>
          </div>
        )}

        {/* 👥 フォロー中のプレイヤー一覧 */}
        {followingList.length > 0 && (
          <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
            <h3 className="text-lg font-black text-purple-400 flex items-center space-x-2">
              <span>👥 フォロー中のプレイヤー (ライバル一覧)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {followingList.map((user, idx) => (
                <div key={idx} className="bg-slate-900/80 p-4 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-black text-white">{user.user_name}</div>
                      <div className="text-xs text-cyan-400 font-mono">@{user.custom_id}</div>
                    </div>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold">
                      {user.season_id || 'Season 1'}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-white/5 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block">現在のランク</span>
                      <span className="font-bold text-pink-400">{user.rank_name || '判定マッチ'}</span>
                      {user.rank_name !== '判定マッチ' && (
                        <span className="ml-2 text-slate-300">Class {user.class_index}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 text-[10px] block">粒 / ポイント</span>
                      <span className="font-mono text-cyan-300 font-bold">💎 {user.grains || 0} 粒</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🔍 プレイヤー検索 & フォローセクション */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <h3 className="text-lg font-black text-cyan-400 flex items-center space-x-2">
            <span>🔍 プレイヤー検索 ＆ フォロー</span>
          </h3>
          <p className="text-xs text-slate-400">ほかのプレイヤーのカスタムIDや名前で検索して、現在のランク状況を確認できます。</p>

          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="カスタムIDまたは名前で検索 (例: moyashi)"
              className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:border-cyan-500 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-md"
            >
              検索
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="space-y-3 pt-2">
              {searchResults.map((user, idx) => (
                <div key={idx} className="bg-slate-900/90 p-4 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-bold text-white">
                        {user.user_name} <span className="text-cyan-400 font-mono text-xs">@{user.custom_id}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">プロセカID: {user.userId || '未設定'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFollow(user.custom_id)}
                      className="bg-pink-600/20 hover:bg-pink-600/40 text-pink-300 border border-pink-500/40 font-bold px-4 py-1.5 rounded-xl text-xs transition"
                    >
                      フォローする
                    </button>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-xl border border-white/5 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px]">ランク: </span>
                      <span className="font-bold text-pink-400">{user.rank_name || '判定マッチ'}</span>
                      {user.rank_name !== '判定マッチ' && <span className="ml-1 text-slate-300">Class {user.class_index}</span>}
                    </div>
                    <div>
                      <span className="text-cyan-300 font-mono font-bold">💎 {user.grains || 0} 粒</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ⚠️ 危険領域 */}
        <div className="glass-panel p-6 rounded-3xl border border-rose-500/30 bg-rose-950/10 space-y-4 mt-12">
          <h3 className="text-lg font-black text-rose-400 flex items-center space-x-2">
            <span>⚠️ 危険領域 (データ初期化)</span>
          </h3>
          <p className="text-xs text-slate-400">すべての対戦記録および現在のランク・クラス粒情報を完全に初期化します。</p>
          <button
            type="button"
            onClick={handleResetData}
            className="bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/50 font-bold py-2.5 px-5 rounded-xl text-xs transition"
          >
            全データを初期化して判定マッチに戻す
          </button>
        </div>
      </main>
    </div>
  );
}