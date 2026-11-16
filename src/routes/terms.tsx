import { createFileRoute } from "@tanstack/react-router";
import { legal } from "@/i18n";
import { LegalPage } from "@/components/site/legal-page";

const title = "Terms of Service · Wconfa";
const desc = "The rules for using Wconfa: eligibility, prohibited content, harassment, suspension and liability.";
export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title }, { name: "description", content: desc },
      { property: "og:title", content: title }, { property: "og:description", content: desc },
      { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc={legal.terms} />,
});
