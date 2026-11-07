import { createFileRoute } from "@tanstack/react-router";

import { InsightsPage } from "@/pages/rep/InsightsPage";

export const Route = createFileRoute("/rep/insights")({
  head: () => ({
    meta: [
      { title: "Insights · Stress Forecast" },
      { name: "description", content: "Patterns spotted in the class's check-ins this term." },
      { property: "og:title", content: "Insights · Stress Forecast" },
      { property: "og:description", content: "Patterns spotted in the class's check-ins this term." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightsPage,
});
