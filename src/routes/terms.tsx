import { pageSeo } from "@/lib/site";
import { createFileRoute } from "@tanstack/react-router";
import { legal } from "@/i18n";
import { LegalPage } from "@/components/site/legal-page";

const title = "Terms of Service · Wconfa";
const desc = "The rules for using Wconfa: eligibility, prohibited content, harassment, suspension and liability.";
export const Route = createFileRoute("/terms")({
  head: () => pageSeo("/terms", title, desc, "article"),
  component: () => <LegalPage doc={legal.terms} />,
});
