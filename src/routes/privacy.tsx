import { pageSeo } from "@/lib/site";
import { createFileRoute } from "@tanstack/react-router";
import { legal } from "@/i18n";
import { LegalPage } from "@/components/site/legal-page";

const title = "Privacy Policy · Wconfa";
const desc = "What Wconfa collects, why, how long we keep it, and your rights. No ads, no trackers, no selling data.";
export const Route = createFileRoute("/privacy")({
  head: () => pageSeo("/privacy", title, desc, "article"),
  component: () => <LegalPage doc={legal.privacy} />,
});
