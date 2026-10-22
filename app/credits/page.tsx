// app/credits/page.tsx
import InfoPageShell from '@/components/InfoPageShell';
import { CREDITS, SITE_NAME } from '@/lib/siteContent';

export const metadata = { title: `スペシャルサンクス | ${SITE_NAME}` };

export default function CreditsPage() {
  return (
    <InfoPageShell title="スペシャルサンクス" icon="🎉" description={`${SITE_NAME}は、たくさんの方々の協力で作られています。`}>
      <div className="space-y-4">
        {CREDITS.map((group) => (
          <section key={group.title} className="glass-panel border border-white/10 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-pink-300">{group.title}</h3>
            <ul className="space-y-2">
              {group.entries.map((e, i) => (
                <li key={`${e.name}-${i}`} className="text-xs leading-relaxed">
                  {e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-white underline decoration-white/30 hover:decoration-white"
                    >
                      {e.name}
                    </a>
                  ) : (
                    <span className="font-bold text-white">{e.name}</span>
                  )}
                  {e.role && <span className="text-slate-400">　{e.role}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </InfoPageShell>
  );
}
