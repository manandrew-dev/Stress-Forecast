import { createFileRoute } from "@tanstack/react-router";

import { CheckinPage } from "@/pages/student/CheckinPage";

export const Route = createFileRoute("/student/check-in")({
  head: () => ({
    meta: [
      { title: "Daily check-in · Stress Forecast" },
      { name: "description", content: "Tell us how you're feeling today, by typing or speaking." },
      { property: "og:title", content: "Daily check-in · Stress Forecast" },
      { property: "og:description", content: "Tell us how you're feeling today, by typing or speaking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckinPage,
});
