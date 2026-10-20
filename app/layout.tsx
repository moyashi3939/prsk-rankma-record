'use client';

import { useState } from 'react';
import type { Metadata } from 'next'; // ※Next.jsの型定義関係で layout が client component になると Metadata がエラーになる場合があるので下部に注意書きあり
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RecordModal from '@/components/RecordModal';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleModalSubmit = (recordData: any) => {
    // ここでレコード保存処理（API呼び出しなど）を行うか、
    // 各ページ側で処理したい場合はイベント等で受け渡します
    console.log('保存データ:', recordData);
    setIsModalOpen(false);
  };

  return (
    <html lang="ja">
      <body className="min-h-screen selection:bg-pink-500 selection:text-white relative">
        {/* 背景のネオン装飾 */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-600/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none"></div>

        {/* ヘッダー */}
        <header className="sticky top-0 z-40 glass-panel border-b border-white/10 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3.5 h-7 bg-gradient-to-b from-pink-500 to-cyan-400 rounded-full shadow-[0_0_12px_rgba(236,72,153,0.6)]"></div>
            <h1 className="text-xl font-black tracking-wider bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
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
            className="bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-bold py-2.5 px-6 rounded-2xl shadow-lg shadow-pink-600/30 transition transform hover:scale-105 text-sm cursor-pointer"
          >
            新規記録
          </button>
        </header>

        {/* メインコンテンツ */}
        <main className="max-w-6xl mx-auto p-6 md:p-10 relative z-10">
          {children}
        </main>

        {/* どこからでも呼び出せる共通レコード登録モーダル */}
        <RecordModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleModalSubmit}
        />
      </body>
    </html>
  );
}