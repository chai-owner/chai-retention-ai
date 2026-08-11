import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/chai";
import { IdentityResolution } from "@/components/identity-resolution";

export const Route = createFileRoute("/_authenticated/app/identity")({
  head: () => ({
    meta: [
      { title: "Identity Resolution — ChAi" },
      {
        name: "description",
        content:
          "Manage how customer records from every platform match up: unmatched references, saved links, duplicates and connected identities.",
      },
    ],
  }),
  component: IdentityPage,
});

function IdentityPage() {
  return (
    <div>
      <PageHeader
        title="Identity Resolution"
        description="One place to manage how records from every platform roll up to the right customer."
      />
      <IdentityResolution />
    </div>
  );
}
