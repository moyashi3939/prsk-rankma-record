'use client';

import { useEffect, useRef, useState } from 'react';
import type { Metadata } from 'next'; // ※Next.jsの型定義関係で layout が client component になると Metadata がエラーになる場合があるので下部に注意書きあり
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RecordModal from '@/components/RecordModal';
import ToastHost from '@/components/ToastHost';
import MobileNav from '@/components/MobileNav';
import { toast, toastAfterReload } from '@/lib/toast';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rankName, setRankName] = useState<string | null>(null); // いまのランク（曲の判別の手がかり）
  const pendingSaves = useRef<Promise<void>[]>([]); // 保存中の通信
  const savedAny = useRef(false); // 記録を保存したか（閉じたときに、画面を更新するため）

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  // 記録画面を開いたときに、いまのランクを取得する
  useEffect(() => {
    if (!isModalOpen) return;
    fetch('/api/rank', { cache: 'no-store' })
      .then((res) => res.json())
      .then((r) => setRankName(r && r.isPlacementCompleted ? r.rankName : null))
      .catch(() => setRankName(null));
  }, [isModalOpen]);

  // ヘッダー・画面の下のメニューの「新規記録」から保存する（ホーム画面の記録と同じ、/api/matches を使う）
  const handleModalSubmit = (recordData: any) => {
    const save = (async () => {
      try {
        const res = await fetch('/api/matches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordData),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.detail ? `${json.error}：${json.detail}` : json.error || 'Failed to save match');
        savedAny.current = true;
      } catch (error) {
        console.error('保存エラー:', error);
        toast(`対戦データの保存に失敗しました。${error instanceof Error && error.message ? `\n${error.message}` : ''}`, 'error');
      }
    })();
    pendingSaves.current.push(save);
  };

  // 記録画面を閉じたとき。保存していたら、保存の完了を待って、画面を最新にする
  const handleModalClose = async () => {
    setIsModalOpen(false);
    await Promise.all(pendingSaves.current);
    pendingSaves.current = [];
    if (savedAny.current) {
      savedAny.current = false;
      toastAfterReload('対戦を記録しました。', 'success');
      window.location.reload();
    }
  };

  const isAdminPage = pathname.startsWith('/admin');

  return (
    <html lang="ja">
      <body className="min-h-screen selection:bg-pink-500 selection:text-white relative">
        {/* 背景のネオン装飾 */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-600/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none"></div>

        {/* ヘッダー */}
        <header className="sticky top-0 z-40 glass-panel border-b border-white/10 px-4 py-3 md:px-8 md:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3.5 h-7 bg-gradient-to-b from-pink-500 to-cyan-400 rounded-full shadow-[0_0_12px_rgba(236,72,153,0.6)]"></div>
            <h1 className="text-lg md:text-xl font-black tracking-wider bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
              ランクマレコード
            </h1>
          </div>

          <nav className="hidden md:flex items-center space-x-1 font-medium text-sm">
            <Link href="/" className={`px-5 py-2 rounded-xl transition ${pathname === '/' ? 'text-white bg-white/10 font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              ホーム
            </Link>
            <Link href="/history" className={`px-5 py-2 rounded-xl transition ${pathname === '/history' ? 'text-white bg-white/10 font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              履歴
            </Link>
            <Link href="/analytics" className={`px-5 py-2 rounded-xl transition ${pathname === '/analytics' ? 'text-white bg-white/10 font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              分析
            </Link>
            <Link href="/settings" className={`px-5 py-2 rounded-xl transition ${pathname === '/settings' ? 'text-white bg-white/10 font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              設定
            </Link>
          </nav>

          <button
            type="button"
            onClick={handleOpenModal}
            className="hidden md:block bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-bold py-2.5 px-6 rounded-2xl shadow-lg shadow-pink-600/30 transition transform hover:scale-105 text-sm cursor-pointer"
          >
            新規記録
          </button>
        </header>

        {/* メインコンテンツ */}
        <main className={`max-w-6xl mx-auto p-4 md:p-10 relative z-10 ${isAdminPage ? '' : 'pb-28 md:pb-10'}`}>
          {children}
        </main>

        {/* どこからでも呼び出せる共通レコード登録モーダル */}
        {/* スマホ（縦画面）用の、画面の下のメニュー */}
        {!isAdminPage && <MobileNav pathname={pathname} onRecord={handleOpenModal} />}

        <RecordModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSubmit={handleModalSubmit}
          rankName={rankName}
        />
        <ToastHost />
      </body>
    </html>
  );
}