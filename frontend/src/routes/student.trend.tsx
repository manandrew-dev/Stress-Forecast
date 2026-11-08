import { createFileRoute } from "@tanstack/react-router";

import { TrendPage } from "@/pages/student/TrendPage";

export const Route = createFileRoute("/student/trend")({
  head: () => ({
    meta: [
      { title: "My trend · Stress Forecast" },
      { name: "description", content: "Your stress over time with your deadlines marked." },
      { property: "og:title", content: "My trend · Stress Forecast" },
      { property: "og:description", content: "Your stress over time with your deadlines marked." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrendPage,
});
