import { createFileRoute } from "@tanstack/react-router";

import { StudentHomePage } from "@/pages/student/HomePage";

export const Route = createFileRoute("/student/")({
  head: () => ({
    meta: [
      { title: "Today · Stress Forecast" },
      { name: "description", content: "Your heads-up for upcoming deadline pile-ups and a quick check-in." },
      { property: "og:title", content: "Today · Stress Forecast" },
      { property: "og:description", content: "Your heads-up for upcoming deadline pile-ups and a quick check-in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentHomePage,
});
