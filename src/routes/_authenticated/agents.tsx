import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { AppHeader } from "@/components/dashboard/AppHeader";
import {
  getRoster,
  saveRoster,
  onStoreChange,
  type RosterAgent,
} from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "Agent Management | CureMe Abroad TC Dashboard" },
      {
        name: "description",
        content:
          "Add, rename or remove teleconsultation coordinators. Changes update the daily entry table automatically.",
      },
      { property: "og:title", content: "Agent Management — CureMe Abroad TC Dashboard" },
      {
        property: "og:description",
        content: "Manage the coordinator roster used for daily TC reporting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const [roster, setRoster] = useState<RosterAgent[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    setRoster(getRoster());
    return onStoreChange(() => setRoster(getRoster()));
  }, []);

  const persist = (list: RosterAgent[]) => {
    setRoster(list);
    saveRoster(list);
  };

  const addAgent = () => {
    const n = name.trim();
    if (!n) {
      toast.error("Enter an agent name.");
      return;
    }
    if (n.length > 60) {
      toast.error("Name must be under 60 characters.");
      return;
    }
    if (roster.some((r) => r.name.toLowerCase() === n.toLowerCase())) {
      toast.error("That agent already exists.");
      return;
    }
    persist([...roster, { id: crypto.randomUUID(), name: n, active: true }]);
    setName("");
    toast.success(`${n} added`);
  };

  const saveEdit = (id: string) => {
    const n = editValue.trim();
    if (!n) {
      toast.error("Name cannot be empty.");
      return;
    }
    if (
      roster.some((r) => r.id !== id && r.name.toLowerCase() === n.toLowerCase())
    ) {
      toast.error("That agent already exists.");
      return;
    }
    persist(roster.map((r) => (r.id === id ? { ...r, name: n } : r)));
    setEditingId(null);
    toast.success("Agent updated");
  };

  const toggleActive = (a: RosterAgent) => {
    persist(roster.map((r) => (r.id === a.id ? { ...r, active: !r.active } : r)));
    toast.success(`${a.name} marked ${a.active ? "inactive" : "active"}`);
  };

  const remove = (a: RosterAgent) => {
    persist(roster.filter((r) => r.id !== a.id));
    toast.success(`${a.name} removed`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">
          Agent Management
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes here update the daily entry table automatically.
        </p>

        <div className="mt-6 flex gap-2">
          <Input
            value={name}
            maxLength={60}
            placeholder="New agent name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAgent()}
            className="h-10 rounded-xl"
          />
          <Button onClick={addAgent} className="rounded-xl">
            <Plus className="size-4" /> Add Agent
          </Button>
        </div>

        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card shadow-soft">
          {roster.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              {editingId === a.id ? (
                <>
                  <Input
                    value={editValue}
                    maxLength={60}
                    autoFocus
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(a.id)}
                    className="h-9 rounded-lg"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Save"
                    className="size-9 rounded-lg text-success"
                    onClick={() => saveEdit(a.id)}
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Cancel"
                    className="size-9 rounded-lg"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium">
                    {a.name}
                    <span
                      className={
                        "ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                        (a.active
                          ? "bg-success-soft text-success"
                          : "bg-secondary text-muted-foreground")
                      }
                    >
                      {a.active ? "Active" : "Inactive"}
                    </span>
                  </span>
                  <Switch
                    checked={a.active}
                    aria-label={`Toggle ${a.name} active`}
                    onCheckedChange={() => toggleActive(a)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${a.name}`}
                    className="size-9 rounded-lg text-muted-foreground"
                    onClick={() => {
                      setEditingId(a.id);
                      setEditValue(a.name);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${a.name}`}
                    className="size-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => remove(a)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
          {roster.length === 0 ? (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">
              No agents yet. Add your first coordinator above.
            </li>
          ) : null}
        </ul>
      </main>
    </div>
  );
}
