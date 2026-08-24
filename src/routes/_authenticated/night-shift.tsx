import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Hospital,
  MessageSquareWarning,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { effectiveBookings, parseTcBookings, type TcBooking } from "@/lib/tc-shift";

export const Route = createFileRoute("/_authenticated/night-shift")({
  head: () => ({
    meta: [
      { title: "Night Shift Command Center | CureMeAbroad" },
      {
        name: "description",
        content: "Night shift coordination for chats, TCs, estimates, priorities and sales handoff.",
      },
    ],
  }),
  component: NightShiftCommandCenter,
});

type ChatStatus = "Needs Attention" | "Escalated to Agent" | "Escalate to Nirmay" | "Day Shift Handover" | "Resolved";
type Priority = "P0" | "P1" | "P2";
type EstimateStatus = "To Float" | "Awaiting Hospital" | "Received" | "Shared";

type ChatItem = {
  id: string;
  caseId: string;
  patient: string;
  stage: string;
  agent: string;
  waitingMinutes: number;
  status: ChatStatus;
  note: string;
};

type PriorityItem = {
  id: string;
  caseId: string;
  patient: string;
  closureAgent: string;
  priority: Priority;
};

type EstimateItem = {
  id: string;
  caseId: string;
  patient: string;
  hospital: string;
  status: EstimateStatus;
  note: string;
};

type HandoffItem = {
  id: string;
  caseId: string;
  patient: string;
  closureAgent: string;
  invoice: boolean;
  finalEstimate: boolean;
  packageDocs: boolean;
  hospitalProfile: boolean;
  doctorProfile: boolean;
};

type Store = {
  shiftDate: string;
  chats: ChatItem[];
  priorities: PriorityItem[];
  estimates: EstimateItem[];
  handoffs: HandoffItem[];
  scheduledRaw: string;
  alignedRaw: string;
};

const todayIso = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const storageKey = (date: string) => `cma.night-shift-v1.${date}`;

const emptyStore = (shiftDate: string): Store => ({
  shiftDate,
  chats: [],
  priorities: [],
  estimates: [],
  handoffs: [],
  scheduledRaw: "",
  alignedRaw: "",
});

function loadStore(date: string): Store {
  if (typeof window === "undefined") return emptyStore(date);
  try {
    const raw = window.localStorage.getItem(storageKey(date));
    return raw ? { ...emptyStore(date), ...(JSON.parse(raw) as Store), shiftDate: date } : emptyStore(date);
  } catch {
    return emptyStore(date);
  }
}

function Kpi({ label, value, sub, tone = "text-foreground" }: { label: string; value: string | number; sub: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function NightShiftCommandCenter() {
  const [shiftDate, setShiftDate] = useState(todayIso());
  const [store, setStore] = useState<Store>(() => loadStore(todayIso()));
  const [chatDraft, setChatDraft] = useState({ caseId: "", patient: "", stage: "", agent: "", waitingMinutes: "", note: "" });
  const [priorityDraft, setPriorityDraft] = useState({ caseId: "", patient: "", closureAgent: "", priority: "P0" as Priority });
  const [estimateDraft, setEstimateDraft] = useState({ caseId: "", patient: "", hospital: "", status: "To Float" as EstimateStatus, note: "" });
  const [handoffDraft, setHandoffDraft] = useState({ caseId: "", patient: "", closureAgent: "" });

  useEffect(() => {
    setStore(loadStore(shiftDate));
  }, [shiftDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey(shiftDate), JSON.stringify({ ...store, shiftDate }));
  }, [store, shiftDate]);

  const scheduled = useMemo(() => parseTcBookings(store.scheduledRaw, "scheduled"), [store.scheduledRaw]);
  const aligned = useMemo(() => parseTcBookings(store.alignedRaw, "aligned"), [store.alignedRaw]);
  const tcRows = useMemo(() => effectiveBookings([...scheduled.bookings, ...aligned.bookings]), [scheduled.bookings, aligned.bookings]);

  const done = tcRows.filter((x) => x.status === "Done").length;
  const noShow = tcRows.filter((x) => x.status === "No-show").length;
  const rescheduled = tcRows.filter((x) => x.status === "Rescheduled").length;
  const scheduledCount = tcRows.filter((x) => x.status === "Scheduled").length;
  const denominator = done + noShow;
  const showRate = denominator > 0 ? Math.round((done / denominator) * 100) : 0;

  const attentionChats = store.chats.filter((x) => x.status !== "Resolved");
  const nirmayEscalations = store.chats.filter((x) => x.status === "Escalate to Nirmay").length;
  const pendingEstimates = store.estimates.filter((x) => x.status === "To Float" || x.status === "Awaiting Hospital");
  const incompleteHandoffs = store.handoffs.filter((x) => ![x.invoice, x.finalEstimate, x.packageDocs, x.hospitalProfile, x.doctorProfile].every(Boolean));
  const dayShiftHandover = store.chats.filter((x) => x.status === "Day Shift Handover");

  const discoveryRows = useMemo(() => {
    const grouped = new Map<string, { scheduled: number; done: number; noShow: number }>();
    tcRows.forEach((booking) => {
      const agent = booking.discoveryAgent || "Unassigned";
      const row = grouped.get(agent) ?? { scheduled: 0, done: 0, noShow: 0 };
      if (booking.status === "Done") row.done += 1;
      if (booking.status === "No-show") row.noShow += 1;
      if (booking.status === "Scheduled") row.scheduled += 1;
      grouped.set(agent, row);
    });
    return [...grouped.entries()].map(([agent, row]) => ({ agent, ...row, showRate: row.done + row.noShow > 0 ? Math.round((row.done / (row.done + row.noShow)) * 100) : 0 }));
  }, [tcRows]);

  const priorityRows = useMemo(() => {
    const grouped = new Map<string, { p0: number; p1: number; p2: number }>();
    store.priorities.forEach((item) => {
      const row = grouped.get(item.closureAgent || "Unassigned") ?? { p0: 0, p1: 0, p2: 0 };
      if (item.priority === "P0") row.p0 += 1;
      if (item.priority === "P1") row.p1 += 1;
      if (item.priority === "P2") row.p2 += 1;
      grouped.set(item.closureAgent || "Unassigned", row);
    });
    return [...grouped.entries()].map(([agent, row]) => ({ agent, ...row }));
  }, [store.priorities]);

  const addChat = () => {
    if (!chatDraft.caseId.trim()) return toast.error("Case ID is required");
    setStore((s) => ({ ...s, chats: [...s.chats, { id: makeId(), caseId: chatDraft.caseId.trim(), patient: chatDraft.patient.trim(), stage: chatDraft.stage.trim(), agent: chatDraft.agent.trim(), waitingMinutes: Number(chatDraft.waitingMinutes || 0), status: "Needs Attention", note: chatDraft.note.trim() }] }));
    setChatDraft({ caseId: "", patient: "", stage: "", agent: "", waitingMinutes: "", note: "" });
  };

  const addPriority = () => {
    if (!priorityDraft.caseId.trim() || !priorityDraft.closureAgent.trim()) return toast.error("Case ID and Closure Agent are required");
    setStore((s) => ({ ...s, priorities: [...s.priorities, { id: makeId(), ...priorityDraft, caseId: priorityDraft.caseId.trim(), patient: priorityDraft.patient.trim(), closureAgent: priorityDraft.closureAgent.trim() }] }));
    setPriorityDraft({ caseId: "", patient: "", closureAgent: "", priority: "P0" });
  };

  const addEstimate = () => {
    if (!estimateDraft.caseId.trim() || !estimateDraft.hospital.trim()) return toast.error("Case ID and Hospital are required");
    setStore((s) => ({ ...s, estimates: [...s.estimates, { id: makeId(), ...estimateDraft, caseId: estimateDraft.caseId.trim(), patient: estimateDraft.patient.trim(), hospital: estimateDraft.hospital.trim(), note: estimateDraft.note.trim() }] }));
    setEstimateDraft({ caseId: "", patient: "", hospital: "", status: "To Float", note: "" });
  };

  const addHandoff = () => {
    if (!handoffDraft.caseId.trim()) return toast.error("Case ID is required");
    setStore((s) => ({ ...s, handoffs: [...s.handoffs, { id: makeId(), ...handoffDraft, caseId: handoffDraft.caseId.trim(), patient: handoffDraft.patient.trim(), closureAgent: handoffDraft.closureAgent.trim(), invoice: false, finalEstimate: false, packageDocs: false, hospitalProfile: false, doctorProfile: false }] }));
    setHandoffDraft({ caseId: "", patient: "", closureAgent: "" });
  };

  const report = `Night Shift Report — ${shiftDate}\n\nTC Performance\nTC Done: ${done}\nNo-show: ${noShow}\nRescheduled: ${rescheduled}\nPending Scheduled: ${scheduledCount}\nShow Rate: ${showRate}%\n\nChat Control\nNeeds Attention / Open: ${attentionChats.length}\nEscalate to Nirmay: ${nirmayEscalations}\nDay Shift Handover: ${dayShiftHandover.length}\n\nEstimates\nPending: ${pendingEstimates.length}\nReceived/Shared: ${store.estimates.length - pendingEstimates.length}\n\nSales Handoff\nTotal Sales Handoffs: ${store.handoffs.length}\nIncomplete: ${incompleteHandoffs.length}\nComplete: ${store.handoffs.length - incompleteHandoffs.length}\n\nTC Show Rate by Discovery\n${discoveryRows.map((x) => `${x.agent}: Done ${x.done} | No-show ${x.noShow} | Show Rate ${x.showRate}%`).join("\n") || "No TC data"}\n\nTC Priority Mix by Closure\n${priorityRows.map((x) => `${x.agent}: P0 ${x.p0} | P1 ${x.p1} | P2 ${x.p2}`).join("\n") || "No priority data"}`;

  const copyReport = async () => {
    await navigator.clipboard.writeText(report);
    toast.success("Night Shift Report copied");
  };

  const allClear = attentionChats.length === 0 && pendingEstimates.length === 0 && incompleteHandoffs.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader actions={<Badge variant="outline" className="hidden sm:inline-flex">Night Shift V1</Badge>} />
      <Toaster richColors />
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">CureMeAbroad Coordination Team</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Night Shift Command Center</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">V1 combines shift attention, TC reporting, closure priority, hospital estimates and sales handoff in one working screen.</p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="shiftDate" className="text-xs">Shift date (IST)</Label>
              <Input id="shiftDate" type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} className="mt-1 w-44" />
            </div>
            <Button variant="outline" onClick={() => { window.localStorage.setItem(storageKey(shiftDate), JSON.stringify(store)); toast.success("Shift saved on this device"); }}><Save className="mr-2 size-4" />Save</Button>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${allClear ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            {allClear ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" /> : <AlertTriangle className="mt-0.5 size-5 text-amber-700" />}
            <div><p className="font-semibold">{allClear ? "Shift is clear" : "Attention still required"}</p><p className="text-sm text-muted-foreground">{allClear ? "No open chat escalation, pending estimate or incomplete sales handoff is recorded." : `${attentionChats.length} chat item(s), ${pendingEstimates.length} estimate(s), ${incompleteHandoffs.length} handoff(s) need action.`}</p></div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="Unattended / Open" value={attentionChats.length} sub="Chat attention queue" tone={attentionChats.length ? "text-red-600" : "text-emerald-600"} />
          <Kpi label="TC Show Rate" value={`${showRate}%`} sub={`${done} done / ${noShow} no-show`} tone="text-primary" />
          <Kpi label="P0 Cases" value={store.priorities.filter((x) => x.priority === "P0").length} sub="Highest closure priority" tone="text-red-600" />
          <Kpi label="Estimates Pending" value={pendingEstimates.length} sub="To float or awaiting hospital" tone={pendingEstimates.length ? "text-amber-600" : "text-emerald-600"} />
          <Kpi label="Handoff Pending" value={incompleteHandoffs.length} sub="Sales docs incomplete" tone={incompleteHandoffs.length ? "text-amber-600" : "text-emerald-600"} />
        </div>

        <Section title="1. Shift Chat Monitoring" subtitle="Track unattended cases and move each one through the escalation path.">
          <div className="grid gap-2 lg:grid-cols-6">
            <Input placeholder="Case ID *" value={chatDraft.caseId} onChange={(e) => setChatDraft((d) => ({ ...d, caseId: e.target.value }))} />
            <Input placeholder="Patient" value={chatDraft.patient} onChange={(e) => setChatDraft((d) => ({ ...d, patient: e.target.value }))} />
            <Input placeholder="Stage" value={chatDraft.stage} onChange={(e) => setChatDraft((d) => ({ ...d, stage: e.target.value }))} />
            <Input placeholder="Agent" value={chatDraft.agent} onChange={(e) => setChatDraft((d) => ({ ...d, agent: e.target.value }))} />
            <Input type="number" placeholder="Waiting mins" value={chatDraft.waitingMinutes} onChange={(e) => setChatDraft((d) => ({ ...d, waitingMinutes: e.target.value }))} />
            <Button onClick={addChat}><MessageSquareWarning className="mr-2 size-4" />Add Case</Button>
          </div>
          <Input className="mt-2" placeholder="Note / last action" value={chatDraft.note} onChange={(e) => setChatDraft((d) => ({ ...d, note: e.target.value }))} />
          <div className="mt-4 space-y-2">
            {store.chats.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No chat cases recorded.</p> : store.chats.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div><p className="font-semibold">{item.caseId} {item.patient ? `— ${item.patient}` : ""}</p><p className="text-xs text-muted-foreground">{item.stage || "Stage not set"} · {item.agent || "Agent not set"} · Waiting {item.waitingMinutes}m {item.note ? `· ${item.note}` : ""}</p></div>
                <div className="flex flex-wrap gap-1.5">
                  {(["Needs Attention", "Escalated to Agent", "Escalate to Nirmay", "Day Shift Handover", "Resolved"] as ChatStatus[]).map((status) => <Button key={status} size="sm" variant={item.status === status ? "default" : "outline"} onClick={() => setStore((s) => ({ ...s, chats: s.chats.map((x) => x.id === item.id ? { ...x, status } : x) }))}>{status}</Button>)}
                  <Button size="sm" variant="ghost" onClick={() => setStore((s) => ({ ...s, chats: s.chats.filter((x) => x.id !== item.id) }))}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="2. TC Control & Show Rate" subtitle="Paste the same CRM Today’s Schedule and Aligned Today text. V1 reuses the existing TC parser.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div><Label>Today’s Schedule CRM Text</Label><Textarea className="mt-2 min-h-44 font-mono text-xs" value={store.scheduledRaw} onChange={(e) => setStore((s) => ({ ...s, scheduledRaw: e.target.value }))} placeholder="Paste Today’s Schedule here..." /></div>
            <div><Label>Aligned Today CRM Text</Label><Textarea className="mt-2 min-h-44 font-mono text-xs" value={store.alignedRaw} onChange={(e) => setStore((s) => ({ ...s, alignedRaw: e.target.value }))} placeholder="Paste Aligned Today here..." /></div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4"><Kpi label="Done" value={done} sub="Effective bookings" /><Kpi label="No-show" value={noShow} sub="Effective bookings" /><Kpi label="Rescheduled" value={rescheduled} sub="Effective bookings" /><Kpi label="Scheduled" value={scheduledCount} sub="Still pending outcome" /></div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-secondary/60"><tr><th className="px-3 py-2 text-left">Discovery Agent</th><th className="px-3 py-2 text-right">Done</th><th className="px-3 py-2 text-right">No-show</th><th className="px-3 py-2 text-right">Pending</th><th className="px-3 py-2 text-right">Show Rate</th></tr></thead><tbody>{discoveryRows.map((row) => <tr key={row.agent} className="border-t"><td className="px-3 py-2 font-medium">{row.agent}</td><td className="px-3 py-2 text-right">{row.done}</td><td className="px-3 py-2 text-right">{row.noShow}</td><td className="px-3 py-2 text-right">{row.scheduled}</td><td className="px-3 py-2 text-right font-semibold">{row.showRate}%</td></tr>)}</tbody></table></div>
        </Section>

        <Section title="3. TC Priority Mix" subtitle="Record P0 / P1 / P2 for closure cases; the agent-wise mix is calculated automatically.">
          <div className="grid gap-2 lg:grid-cols-5"><Input placeholder="Case ID *" value={priorityDraft.caseId} onChange={(e) => setPriorityDraft((d) => ({ ...d, caseId: e.target.value }))} /><Input placeholder="Patient" value={priorityDraft.patient} onChange={(e) => setPriorityDraft((d) => ({ ...d, patient: e.target.value }))} /><Input placeholder="Closure Agent *" value={priorityDraft.closureAgent} onChange={(e) => setPriorityDraft((d) => ({ ...d, closureAgent: e.target.value }))} /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={priorityDraft.priority} onChange={(e) => setPriorityDraft((d) => ({ ...d, priority: e.target.value as Priority }))}><option>P0</option><option>P1</option><option>P2</option></select><Button onClick={addPriority}><Users className="mr-2 size-4" />Add Priority</Button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">{priorityRows.map((row) => <div key={row.agent} className="rounded-xl border p-4"><p className="font-semibold">{row.agent}</p><div className="mt-3 flex gap-2"><Badge variant="destructive">P0 {row.p0}</Badge><Badge variant="outline">P1 {row.p1}</Badge><Badge variant="secondary">P2 {row.p2}</Badge></div></div>)}</div>
          {store.priorities.length > 0 ? <div className="mt-4 space-y-1">{store.priorities.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span><b>{item.caseId}</b> · {item.patient || "—"} · {item.closureAgent} · {item.priority}</span><Button size="sm" variant="ghost" onClick={() => setStore((s) => ({ ...s, priorities: s.priorities.filter((x) => x.id !== item.id) }))}>Remove</Button></div>)}</div> : null}
        </Section>

        <Section title="4. Estimates — Zero Delay" subtitle="Track whether every TC estimate has been floated, received and shared.">
          <div className="grid gap-2 lg:grid-cols-6"><Input placeholder="Case ID *" value={estimateDraft.caseId} onChange={(e) => setEstimateDraft((d) => ({ ...d, caseId: e.target.value }))} /><Input placeholder="Patient" value={estimateDraft.patient} onChange={(e) => setEstimateDraft((d) => ({ ...d, patient: e.target.value }))} /><Input placeholder="Hospital *" value={estimateDraft.hospital} onChange={(e) => setEstimateDraft((d) => ({ ...d, hospital: e.target.value }))} /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={estimateDraft.status} onChange={(e) => setEstimateDraft((d) => ({ ...d, status: e.target.value as EstimateStatus }))}><option>To Float</option><option>Awaiting Hospital</option><option>Received</option><option>Shared</option></select><Input placeholder="Note" value={estimateDraft.note} onChange={(e) => setEstimateDraft((d) => ({ ...d, note: e.target.value }))} /><Button onClick={addEstimate}><Hospital className="mr-2 size-4" />Add Estimate</Button></div>
          <div className="mt-4 space-y-2">{store.estimates.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{item.caseId} {item.patient ? `— ${item.patient}` : ""}</p><p className="text-xs text-muted-foreground">{item.hospital} {item.note ? `· ${item.note}` : ""}</p></div><div className="flex gap-1.5">{(["To Float", "Awaiting Hospital", "Received", "Shared"] as EstimateStatus[]).map((status) => <Button size="sm" key={status} variant={item.status === status ? "default" : "outline"} onClick={() => setStore((s) => ({ ...s, estimates: s.estimates.map((x) => x.id === item.id ? { ...x, status } : x) }))}>{status}</Button>)}<Button size="sm" variant="ghost" onClick={() => setStore((s) => ({ ...s, estimates: s.estimates.filter((x) => x.id !== item.id) }))}>Remove</Button></div></div>)}</div>
        </Section>

        <Section title="5. Sales → Ops Handoff" subtitle="A sale stays incomplete until all five required handoff documents are marked done.">
          <div className="grid gap-2 lg:grid-cols-4"><Input placeholder="Case ID *" value={handoffDraft.caseId} onChange={(e) => setHandoffDraft((d) => ({ ...d, caseId: e.target.value }))} /><Input placeholder="Patient" value={handoffDraft.patient} onChange={(e) => setHandoffDraft((d) => ({ ...d, patient: e.target.value }))} /><Input placeholder="Closure Agent" value={handoffDraft.closureAgent} onChange={(e) => setHandoffDraft((d) => ({ ...d, closureAgent: e.target.value }))} /><Button onClick={addHandoff}><ClipboardCheck className="mr-2 size-4" />Add Sale</Button></div>
          <div className="mt-4 space-y-3">{store.handoffs.map((item) => { const fields: Array<[keyof Pick<HandoffItem, "invoice" | "finalEstimate" | "packageDocs" | "hospitalProfile" | "doctorProfile">, string]> = [["invoice", "Sales Invoice"], ["finalEstimate", "Final Estimate"], ["packageDocs", "Package Documents"], ["hospitalProfile", "Hospital Profile"], ["doctorProfile", "Doctor Profile"]]; const complete = fields.every(([key]) => item[key]); return <div key={item.id} className={`rounded-xl border p-4 ${complete ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200"}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{item.caseId} {item.patient ? `— ${item.patient}` : ""}</p><p className="text-xs text-muted-foreground">{item.closureAgent || "Closure agent not set"}</p></div><Badge variant={complete ? "secondary" : "outline"}>{complete ? "Handoff Complete" : "Incomplete"}</Badge></div><div className="mt-3 flex flex-wrap gap-2">{fields.map(([key, label]) => <Button key={key} size="sm" variant={item[key] ? "default" : "outline"} onClick={() => setStore((s) => ({ ...s, handoffs: s.handoffs.map((x) => x.id === item.id ? { ...x, [key]: !x[key] } : x) }))}>{item[key] ? "✓ " : ""}{label}</Button>)}<Button size="sm" variant="ghost" onClick={() => setStore((s) => ({ ...s, handoffs: s.handoffs.filter((x) => x.id !== item.id) }))}>Remove</Button></div></div>; })}</div>
        </Section>

        <Section title="6. End-of-Shift Report" subtitle="Review the automatic summary, copy it to WhatsApp, then hand unresolved items to day shift.">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Textarea readOnly className="min-h-[360px] whitespace-pre-wrap font-mono text-xs" value={report} />
            <div className="space-y-3"><div className="rounded-xl border p-4"><p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" />Before you leave</p><div className="mt-3 space-y-2 text-sm text-muted-foreground"><p>{attentionChats.length === 0 ? "✓" : "•"} No unresolved chat attention items</p><p>{nirmayEscalations === 0 ? "✓" : "•"} No pending Nirmay escalation</p><p>{pendingEstimates.length === 0 ? "✓" : "•"} All estimates floated / completed</p><p>{incompleteHandoffs.length === 0 ? "✓" : "•"} All sales handoffs complete</p><p>{dayShiftHandover.length === 0 ? "✓" : "•"} Day-shift handover recorded</p></div></div><Button className="w-full" onClick={copyReport}><FileText className="mr-2 size-4" />Copy WhatsApp Report</Button></div>
          </div>
        </Section>
      </main>
    </div>
  );
}
