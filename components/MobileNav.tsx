'use client';

import Link from 'next/link';

const LEFT = [
  { href: '/', label: 'ホーム', icon: '🏠' },
  { href: '/history', label: '履歴', icon: '📜' },
];
const RIGHT = [
  { href: '/analytics', label: '分析', icon: '📊' },
  { href: '/settings', label: '設定', icon: '⚙️' },
];

// スマホ（縦画面）用の、画面の下のメニュー。中央の丸いボタンから、対戦を記録できる。
// 画面の幅が広いとき（md 以上）は、ヘッダーのメニューを使うので、表示しない。
export default function MobileNav({ pathname, onRecord }: { pathname: string; onRecord: () => void }) {
  const tab = (item: { href: string; label: string; icon: string }) => {
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl text-[10px] font-bold transition ${
          active ? 'text-white' : 'text-slate-400'
        }`}
      >
        <span className={`text-xl leading-none ${active ? '' : 'opacity-70'}`}>{item.icon}</span>
        <span>{item.label}</span>
        <span className={`h-0.5 w-5 rounded-full ${active ? 'bg-gradient-to-r from-pink-500 to-cyan-400' : 'bg-transparent'}`} />
      </Link>
    );
  };

  return (
    <nav
      aria-label="メインメニュー"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-panel border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 items-end px-2 pt-1">
        {LEFT.map(tab)}

        <button
          type="button"
          onClick={onRecord}
          aria-label="新規記録"
          className="flex flex-col items-center gap-0.5 pb-1.5 text-[10px] font-bold text-pink-300"
        >
          <span className="-mt-6 w-14 h-14 rounded-full bg-gradient-to-br from-pink-600 to-cyan-500 shadow-lg shadow-pink-600/40 border-4 border-[#080910] flex items-center justify-center text-3xl leading-none text-white">
            ＋
          </span>
          <span>記録</span>
        </button>

        {RIGHT.map(tab)}
      </div>
    </nav>
  );
}
