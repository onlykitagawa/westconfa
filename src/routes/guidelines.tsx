import { pageSeo } from "@/lib/site";
import { createFileRoute } from "@tanstack/react-router";
import { legal } from "@/i18n";
import { LegalPage } from "@/components/site/legal-page";

const title = "Community Guidelines & Help · Wconfa";
const desc = "What's not allowed on Wconfa, how to report messages, and where to find support.";
export const Route = createFileRoute("/guidelines")({
  head: () => pageSeo("/guidelines", title, desc, "article"),
  component: () => <LegalPage doc={legal.guidelines} />,
});
