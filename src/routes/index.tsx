import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, EyeOff, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: t.landing.metaTitle },
      { name: "description", content: t.landing.metaDesc },
      { property: "og:title", content: t.landing.metaTitle },
      { property: "og:description", content: t.landing.metaDesc },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const safeIcons = [EyeOff, ShieldCheck, SlidersHorizontal];

function Landing() {
  const { user } = useAuth();
  const L = t.landing;
  return (
    <main>
      <section className="mx-auto flex max-w-3xl flex-col items-center px-5 pb-24 pt-20 text-center md:pb-32 md:pt-32">
        <span className="animate-rise rounded-full bg-latte px-4 py-1.5 text-sm font-semibold text-coral">{L.eyebrow}</span>
        <h1 className="animate-rise mt-10 text-[2.75rem] font-extrabold leading-[1.12] md:text-7xl" style={{ animationDelay: "60ms" }}>
          {L.title1}
          <br />
          <span className="text-gradient">{L.title2}</span>
        </h1>
        <p className="animate-rise mt-6 max-w-md text-lg text-muted-foreground md:text-xl" style={{ animationDelay: "120ms" }}>
          {L.subtitle}
        </p>
        <div className="animate-rise mt-10 flex w-full flex-col items-center gap-3 sm:w-auto" style={{ animationDelay: "180ms" }}>
          <Button asChild variant="hero" size="lg" className="w-full sm:w-auto">
            <Link to={user ? "/inbox" : "/auth"}>
              {user ? t.common.openInbox : t.common.getMyLink} <ArrowRight />
            </Link>
          </Button>
          {!user && (
            <Link to="/auth" className="rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
              {t.common.signIn}
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20 md:py-28" aria-labelledby="how">
        <h2 id="how" className="text-center text-3xl font-extrabold tracking-tight md:text-4xl">{L.howTitle}</h2>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {L.steps.map((s, i) => (
            <li key={s.title} className="glass rounded-3xl p-7">
              <span className="grid size-10 place-items-center rounded-2xl bg-latte text-base font-bold text-coral">{i + 1}</span>
              <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20 md:py-28" aria-labelledby="safe">
        <div className="rounded-3xl bg-safety-surface px-6 py-8 text-safety-foreground md:px-10 md:py-10">
        <h2 id="safe" className="text-2xl font-extrabold">{L.safeTitle}</h2>
        <div className="mt-7 grid gap-7 md:grid-cols-3 md:gap-8">
          {L.safe.map((s, i) => {
            const Icon = safeIcons[i] ?? EyeOff;
            return (
              <div key={s.title} className="flex items-start gap-3">
                <Icon className="mt-1 size-5 shrink-0" />
                <div>
                  <h3 className="text-base font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed">{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

        </div>
      <section className="mx-auto max-w-2xl px-5 py-20 md:py-28" aria-labelledby="faq">
        <h2 id="faq" className="text-center text-3xl font-extrabold tracking-tight md:text-4xl">{L.faqTitle}</h2>
        <Accordion type="single" collapsible className="mt-10 border-t">
          {L.faq.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`} className={i === L.faq.length - 1 ? "border-b-0" : ""}>
              <AccordionTrigger className="min-h-14 text-left text-base font-semibold">{f.q}</AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </main>
  );
}
