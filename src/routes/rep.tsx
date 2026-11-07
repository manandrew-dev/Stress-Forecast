import { createFileRoute } from "@tanstack/react-router";

import { RepLayout } from "@/pages/rep/RepLayout";

export const Route = createFileRoute("/rep")({
  component: RepLayout,
});
