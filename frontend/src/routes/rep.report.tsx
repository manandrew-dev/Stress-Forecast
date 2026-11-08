import { createFileRoute } from "@tanstack/react-router";

import { ReportPage } from "@/pages/rep/ReportPage";

export const Route = createFileRoute("/rep/report")({
  head: () => ({
    meta: [
      { title: "Weekly report · Stress Forecast" },
      { name: "description", content: "A weekly summary, top cause and suggested schedule fix." },
      { property: "og:title", content: "Weekly report · Stress Forecast" },
      { property: "og:description", content: "A weekly summary, top cause and suggested schedule fix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});
