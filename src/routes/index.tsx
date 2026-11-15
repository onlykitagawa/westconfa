import { createFileRoute, Link } from "@tanstack/react-router";
import { EyeOff, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FeedbackSection } from "@/components/site/chrome";
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
      <section className="mx-auto max-w-7xl px-5 pb-16 pt-16 text-center md:pb-24 md:pt-24">
        <div className="mx-auto max-w-3xl">
          <h1 className="animate-rise text-[2.4rem] font-extrabold leading-[1.04] text-foreground md:text-7xl">
            {L.title1}
            <br />
            {L.title2}
          </h1>
          <p className="animate-rise mx-auto mt-6 max-w-md text-lg text-muted-foreground md:text-xl">{L.subtitle}</p>
        </div>
        <div className="relative mx-auto mt-10 max-w-6xl md:min-h-[250px]">
          <div className="relative z-10 mx-auto flex max-w-[17rem] flex-col items-center">
            <Button asChild variant="hero" size="lg" className="h-14 px-10">
              {user ? <Link to="/inbox">{t.common.openInbox}</Link> : <Link to="/auth" search={{ mode: "signup" }}>{t.common.getMyLink}</Link>}
            </Button>
            {!user && (
              <Link
                to="/auth"
                className="mt-3 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                {t.common.signIn}
              </Link>
            )}
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{L.note}</p>
          </div>
          <div aria-hidden="true" className="mt-12 flex flex-col gap-7 text-left md:mt-0">
            <div className="glass -rotate-3 self-start rounded-[26px_26px_26px_8px] p-4 px-5 md:absolute md:left-0 md:top-4 md:w-[calc((100%-20rem)/2)] lg:max-w-[280px] max-md:mr-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full bg-coral" />
                {L.sampleMeta}
              </p>
              <p className="text-[17px] font-medium leading-relaxed">{L.sample1}</p>
            </div>
            <div className="glass rotate-3 self-end rounded-[26px_26px_8px_26px] p-4 px-5 md:absolute md:right-0 md:top-4 md:w-[calc((100%-20rem)/2)] lg:max-w-[280px] max-md:ml-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full bg-coral" />
                {L.sampleMeta}
              </p>
              <p className="text-[17px] font-medium leading-relaxed">{L.sample2}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16 md:py-24" aria-labelledby="how">
        <h2 id="how" className="text-center text-3xl font-extrabold md:text-4xl">
          {L.howTitle}
        </h2>
        <ol className="glass mt-10 grid divide-y divide-border rounded-[32px] md:grid-cols-3 md:divide-x md:divide-y-0">
          {L.steps.map((step, i) => (
            <li key={step.title} className="p-7 md:p-8">
              <span className="grid size-11 place-items-center rounded-full bg-brand text-base font-bold text-brand-foreground">
                {i + 1}
              </span>
              <h3 className="mt-5 text-[21px] font-bold leading-snug">{step.title}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16 md:py-24" aria-labelledby="safe">
        <div className="glass rounded-[32px] p-7 md:p-10">
          <h2 id="safe" className="text-center text-3xl font-extrabold md:text-4xl">
            {L.safeTitle}
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {L.safe.map((item, i) => {
              const Icon = safeIcons[i] ?? EyeOff;
              return (
                <div key={item.title} className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-5 py-16 md:py-24" aria-labelledby="faq">
        <h2 id="faq" className="text-center text-3xl font-extrabold md:text-4xl">
          {L.faqTitle}
        </h2>
        <Accordion type="single" collapsible className="mt-10 border-t">
          {L.faq.map((item, i) => (
            <AccordionItem key={item.q} value={`q${i}`}>
              <AccordionTrigger className="min-h-14 text-left text-base font-semibold">{item.q}</AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <FeedbackSection />
    </main>
  );
}
