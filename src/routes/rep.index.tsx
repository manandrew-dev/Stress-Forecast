import { createFileRoute } from "@tanstack/react-router";

import { CohortPage } from "@/pages/rep/CohortPage";

export const Route = createFileRoute("/rep/")({
  head: () => ({
    meta: [
      { title: "Cohort · Stress Forecast" },
      { name: "description", content: "Daily average class stress across the term with every deadline marked." },
      { property: "og:title", content: "Cohort · Stress Forecast" },
      { property: "og:description", content: "Daily average class stress across the term with every deadline marked." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CohortPage,
});
