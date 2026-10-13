import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ランクマレコード',
  description: 'プロセカ ランクマッチ戦績記録・分析アプリ',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-[#0f111a] text-slate-100 min-h-screen flex selection:bg-pink-500 selection:text-white">
        {/* 左側サイドバー（プロセカ風ダークテーマ） */}
        <aside className="w-64 bg-[#16192b] border-r border-slate-800/80 p-6 flex flex-col justify-between shrink-0 min-h-screen fixed left-0 top-0 bottom-0 z-10 shadow-2xl">
          <div>
            <div className="flex items-center space-x-2 mb-10">
              <div className="w-3 h-8 bg-gradient-to-b from-pink-500 to-purple-600 rounded-full"></div>
              <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
                ランクマレコード
              </h1>
            </div>

            <nav className="space-y-1.5 font-medium text-sm">
              <a
                href="#"
                className="flex items-center space-x-3 px-4 py-3 rounded-xl bg-pink-500/10 text-pink-400 font-semibold border border-pink-500/20 shadow-inner"
              >
                <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span>ホーム</span>
              </a>
              <a
                href="#"
                className="flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 9 0 0118 0z" />
                </svg>
                <span>履歴</span>
              </a>
              <a
                href="#"
                className="flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>分析</span>
              </a>
            </nav>
          </div>

          <div>
            <a
              href="#"
              className="flex items-center space-x-3 px-4 py-3 mb-6 rounded-xl text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition text-sm font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>設定</span>
            </a>

            <button className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-pink-600/20 transition flex items-center justify-center space-x-2">
              <span className="text-xl leading-none">+</span>
              <span>新規記録</span>
            </button>
          </div>
        </aside>

        {/* メイン表示エリア */}
        <div className="flex-1 ml-64 p-8 overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}