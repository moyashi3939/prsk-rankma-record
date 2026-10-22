// app/updates/page.tsx
import InfoPageShell from '@/components/InfoPageShell';
import { SITE_NAME, UPDATES } from '@/lib/siteContent';

export const metadata = { title: `アップデート情報 | ${SITE_NAME}` };

export default function UpdatesPage() {
  return (
    <InfoPageShell title="アップデート情報" icon="📢" description="これまでの更新内容です。新しいものが上に表示されます。">
      {UPDATES.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-10">まだ更新情報はありません。</p>
      ) : (
        <div className="space-y-4">
          {UPDATES.map((u, i) => (
            <article key={`${u.date}-${i}`} className="glass-panel border border-white/10 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-3">
                {i === 0 && (
                  <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    NEW
                  </span>
                )}
                <time className="text-[11px] text-slate-400 font-mono">{u.date}</time>
              </div>
              <h3 className="text-sm font-bold text-white">{u.title}</h3>
              {u.items.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300 leading-relaxed">
                  {u.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </InfoPageShell>
  );
}
