import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/pages/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stress Forecast — see the class-wide stress storm coming" },
      {
        name: "description",
        content:
          "Stress Forecast shows why a whole class gets stressed at the same time and helps fix the deadline schedule.",
      },
      { property: "og:title", content: "Stress Forecast — see the class-wide stress storm coming" },
      {
        property: "og:description",
        content: "Daily check-ins lined up with deadlines, so students and class reps can spot pile-ups early.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});
