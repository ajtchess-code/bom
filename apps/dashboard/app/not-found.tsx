import { EmptyState } from "@/components/ui/State";

export default function NotFound() {
  return (
    <main className="uiPage uiCenterPage">
      <EmptyState title="That page doesn't exist" icon="search" actions={[{ label: "Go to the dashboard", href: "/dashboard", primary: true }]}>
        It may have moved when the dashboard was reorganized into seven sections.
      </EmptyState>
    </main>
  );
}
