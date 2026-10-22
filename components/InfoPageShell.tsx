// components/InfoPageShell.tsx
// アップデート情報・利用規約・スペシャルサンクスの、共通の枠
import Link from 'next/link';

const LINKS = [
  { href: '/updates', label: '📢 アップデート情報' },
  { href: '/terms', label: '📄 利用規約' },
  { href: '/credits', label: '🎉 スペシャルサンクス' },
];

export default function InfoPageShell({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16 text-white">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-black bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent">
          {icon} {title}
        </h2>
        <Link
          href="/"
          className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-xl text-xs transition shrink-0"
        >
          ← ホームへ戻る
        </Link>
      </div>

      {description && <p className="text-xs text-slate-400 leading-relaxed">{description}</p>}

      {children}

      <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-6 border-t border-white/10 text-xs">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-slate-400 hover:text-white transition">
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
