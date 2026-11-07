import { createFileRoute } from "@tanstack/react-router";

import { CoursesPage } from "@/pages/student/CoursesPage";

export const Route = createFileRoute("/student/courses")({
  head: () => ({
    meta: [
      { title: "My courses · Stress Forecast" },
      { name: "description", content: "Pick the courses you're enrolled in." },
      { property: "og:title", content: "My courses · Stress Forecast" },
      { property: "og:description", content: "Pick the courses you're enrolled in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoursesPage,
});
