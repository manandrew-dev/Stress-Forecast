import { createFileRoute } from "@tanstack/react-router";

import { CollisionsPage } from "@/pages/rep/CollisionsPage";

export const Route = createFileRoute("/rep/collisions")({
  head: () => ({
    meta: [
      { title: "Deadline pile-ups · Stress Forecast" },
      { name: "description", content: "Where several big assessments land within a few days." },
      { property: "og:title", content: "Deadline pile-ups · Stress Forecast" },
      { property: "og:description", content: "Where several big assessments land within a few days." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CollisionsPage,
});
