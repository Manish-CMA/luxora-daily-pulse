import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  User,
  Target,
  Trophy,
  FilePlus2,
  BarChart3,
  CalendarClock,
  Users,
  Settings as SettingsIcon,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { agentTcsLinedUp, computeTotals, fmtDate, todayIso, topPerformer } from "@/lib/dashboard";
import { getReportByDate, onStoreChange, type SavedReport } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "CureMeAbroad Operations Hub | Operations Home" },
      {
        name: "description",
        content:
          "Central hub for CureMeAbroad teleconsultation operations: monitor TC shifts, submit daily reports, review analytics and manage agents.",
      },
      { property: "og:title", content: "CureMeAbroad Operations Hub" },
      {
        property: "og:description",
        content: "Submit daily TC reports, review analytics and manage your coordinator team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const CARDS: {
  to: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    to: "/daily",
    title: "New Daily Report",
    desc: "Enter today's agent performance and submit the daily report.",
    icon: FilePlus2,
    tone: "bg-primary-soft text-primary",
  },
  {
    to: "/tc-scheduler",
    title: "TC Shift Monitor",
    desc: "Paste scheduled and aligned CRM lists, follow the live shift and compare closing outcomes.",
    icon: CalendarClock,
    tone: "bg-indigo-50 text-indigo-600",
  },
  {
    to: "/reports",
    title: "Reports & Analytics",
    desc: "Daily, weekly, monthly and custom-range performance analytics.",
    icon: BarChart3,
    tone: "bg-success-soft text-success",
  },
  {
    to: "/agents",
    title: "Team Management",
    desc: "Add, edit or remove coordinators from the daily entry table.",
    icon: Users,
    tone: "bg-warning-soft text-warning",
  },
  {
    to: "/settings",
    title: "Settings",
    desc: "Manage stored data and review submitted report history.",
    icon: SettingsIcon,
    tone: "bg-secondary text-foreground",
  },
];

function StatusItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function TodayStatus() {
  const [report, setReport] = useState<SavedReport | null>(null);
  const [today, setToday] = useState("");

  useEffect(() => {
    const date = todayIso();
    setToday(date);
    const load = () => setReport(getReportByDate(date) ?? null);
    load();
    return onStoreChange(load);
  }, []);

  const submitted = Boolean(report);
  const totals = report ? computeTotals(report.agents) : null;
  const top = report ? topPerformer(report.agents) : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Today's Report Status
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{today ? fmtDate(today) : "—"}</p>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
            submitted ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
          }`}
        >
          {submitted ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
          {submitted ? "Submitted" : "Pending"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusItem icon={User} label="Submitted By" value={report?.submittedBy ?? "—"} />
        <StatusItem
          icon={Clock}
          label="Submitted Time"
          value={
            report
              ? new Date(report.submittedAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }
        />
        <StatusItem
          icon={Target}
          label="Today's TCs Lined Up"
          value={totals ? String(totals.totalTcsLinedUp) : "—"}
        />
        <StatusItem
          icon={Trophy}
          label="Today's Top Performer"
          value={top ? `${top.name} (${agentTcsLinedUp(top)})` : "—"}
        />
      </div>
    </section>
  );
}

function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-6 py-12">
        <h2 className="text-2xl font-semibold tracking-tight">Operations Home</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose where you'd like to start.</p>

        <div className="mt-8">
          <TodayStatus />
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {CARDS.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="group rounded-2xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
            >
              <span className={`flex size-12 items-center justify-center rounded-2xl ${c.tone}`}>
                <c.icon className="size-6" />
              </span>
              <h3 className="mt-4 flex items-center gap-2 text-lg font-semibold tracking-tight">
                {c.title}
                <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
