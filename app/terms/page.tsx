// app/terms/page.tsx
import InfoPageShell from '@/components/InfoPageShell';
import { SITE_NAME, TERMS, TERMS_INTRO, TERMS_UPDATED } from '@/lib/siteContent';

export const metadata = { title: `利用規約 | ${SITE_NAME}` };

export default function TermsPage() {
  return (
    <InfoPageShell title="利用規約" icon="📄" description={`最終更新日：${TERMS_UPDATED}`}>
      <div className="glass-panel border border-white/10 rounded-2xl p-6 space-y-6">
        <p className="text-xs text-slate-300 leading-relaxed">{TERMS_INTRO}</p>

        {TERMS.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h3 className="text-sm font-bold text-cyan-300">{section.heading}</h3>
            {section.items && section.items.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300 leading-relaxed">
                {section.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
            {section.paragraphs?.map((p, i) => (
              <p key={i} className="text-xs text-slate-300 leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </InfoPageShell>
  );
}
