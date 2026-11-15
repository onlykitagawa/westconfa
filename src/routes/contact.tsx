import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Check } from "lucide-react";
import { t } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: t.contact.metaTitle }, { name: "description", content: t.contact.metaDesc },
      { property: "og:title", content: t.contact.metaTitle }, { property: "og:description", content: t.contact.metaDesc },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Contact,
});

const makeSchema = () =>
  z.object({
    name: z.string().trim().min(1, t.contact.errName).max(100),
    email: z.string().trim().email(t.contact.errEmail).max(255),
    body: z.string().trim().min(1, t.contact.errBody).max(2000),
  });

function Contact() {
  const [form, setForm] = useState({ name: "", email: "", body: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = makeSchema().safeParse(form);
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? t.common.somethingWrong);
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("contact_messages").insert(parsed.data);
    setBusy(false);
    if (error) setErr(t.common.somethingWrong);
    else setDone(true);
  };

  return (
    <main className="mx-auto max-w-lg px-5 pt-8 md:pt-16">
      <h1 className="animate-rise text-4xl font-extrabold tracking-tight">{t.contact.title}</h1>
      <p className="mt-3 text-muted-foreground">{t.contact.subtitle}</p>
      <div className="glass mt-8 rounded-3xl p-6 md:p-8">
        {done ? (
          <div className="py-6 text-center" role="status">
            <div className="animate-pop mx-auto grid size-16 place-items-center rounded-full bg-success/15 text-success"><Check className="size-8" /></div>
            <p className="mt-4 font-semibold">{t.contact.sent}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="c-name">{t.contact.name}</Label>
              <Input id="c-name" className="h-12 rounded-2xl" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-email">{t.contact.email}</Label>
              <Input id="c-email" type="email" className="h-12 rounded-2xl" value={form.email} maxLength={255} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-body">{t.contact.message}</Label>
              <Textarea id="c-body" rows={5} className="rounded-2xl" value={form.body} maxLength={2000} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            <Button type="submit" variant="hero" className="w-full" disabled={busy}>{t.contact.send}</Button>
          </form>
        )}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">{t.contact.urgent}</p>
    </main>
  );
}
