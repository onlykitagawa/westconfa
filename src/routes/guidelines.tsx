import { createFileRoute } from "@tanstack/react-router";
import { legal } from "@/i18n";
import { LegalPage } from "@/components/site/legal-page";

const title = "Community Guidelines & Help · west confa";
const desc = "What's not allowed on west confa, how to report messages, and where to find support.";
export const Route = createFileRoute("/guidelines")({
  head: () => ({
    meta: [
      { title }, { name: "description", content: desc },
      { property: "og:title", content: title }, { property: "og:description", content: desc },
      { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc={legal.guidelines} />,
});
