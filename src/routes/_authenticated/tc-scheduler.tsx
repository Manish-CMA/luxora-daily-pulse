import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/tc-scheduler")({
  component: TcSchedulerPage,
});

function TcSchedulerPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="text-3xl font-bold">TC Scheduler</h1>

      <p className="mt-2 text-muted-foreground">
        Manage all Teleconsultations from one place.
      </p>
    </div>
  );
}