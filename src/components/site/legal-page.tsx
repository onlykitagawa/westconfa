import { t } from "@/i18n";
import type { LegalDoc } from "@/i18n/legal.en";

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main className="mx-auto max-w-2xl px-5 pt-8 md:pt-16">
      <article className="animate-rise">
        {t.common.legalEnglishOnly && <p className="mb-4 rounded-2xl bg-accent p-4 text-sm text-accent-foreground">{t.common.legalEnglishOnly}</p>}
        <p className="text-sm font-semibold text-muted-foreground">{t.common.lastUpdated}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">{doc.title}</h1>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{doc.intro}</p>
        <div className="mt-10 space-y-6">
          {doc.sections.map((s) => (
            <section key={s.h} className="glass rounded-3xl p-6 md:p-8">
              <h2 className="text-xl font-bold">{s.h}</h2>
              <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">
                {s.p.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
