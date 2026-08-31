import { createFileRoute } from "@tanstack/react-router";
import { FieldRouter } from "@/components/field-router";

export const Route = createFileRoute("/app/")({ component: Page });

function Page() {
  return <FieldRouter center={{ lat: 51.16, lng: 10.45 }} />;
}
