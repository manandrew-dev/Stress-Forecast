import { createFileRoute } from "@tanstack/react-router";

import { DeadlinesPage } from "@/pages/student/DeadlinesPage";

export const Route = createFileRoute("/student/deadlines")({
  head: () => ({
    meta: [
      { title: "Deadlines · Stress Forecast" },
      { name: "description", content: "Every deadline from your courses, soonest first." },
      { property: "og:title", content: "Deadlines · Stress Forecast" },
      { property: "og:description", content: "Every deadline from your courses, soonest first." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeadlinesPage,
});
