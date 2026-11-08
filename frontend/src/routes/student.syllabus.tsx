import { createFileRoute } from "@tanstack/react-router";

import { SyllabusPage } from "@/pages/student/SyllabusPage";

export const Route = createFileRoute("/student/syllabus")({
  head: () => ({
    meta: [
      { title: "Syllabus upload · Stress Forecast" },
      { name: "description", content: "Upload a syllabus and review the deadlines we find." },
      { property: "og:title", content: "Syllabus upload · Stress Forecast" },
      { property: "og:description", content: "Upload a syllabus and review the deadlines we find." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SyllabusPage,
});
