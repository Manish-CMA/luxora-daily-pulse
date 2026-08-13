import fs from "node:fs";

const file = "src/routes/_authenticated/tc-scheduler.tsx";
let s = fs.readFileSync(file, "utf8");

if (s.includes("luxora.tc-day-closed.")) {
  console.log("Close Day feature is already installed.");
  process.exit(0);
}

const stateAnchor = '  const [activeTab, setActiveTab] = useState("import");';
const stateInsert = `${stateAnchor}\n  const closeDayKey = (date: string) => \`luxora.tc-day-closed.\${date}\`;\n  const [dayClosed, setDayClosed] = useState(false);\n\n  useEffect(() => {\n    setDayClosed(\n      typeof window !== "undefined" &&\n        window.localStorage.getItem(closeDayKey(shiftDate)) === "1",\n    );\n  }, [shiftDate]);`;
if (!s.includes(stateAnchor)) throw new Error("Could not find activeTab state anchor");
s = s.replace(stateAnchor, stateInsert);

const saveAnchor = '  const saveSnapshot = async () => {\n';
const saveInsert = `${saveAnchor}    if (dayClosed) {\n      toast.error("This day is closed. Click Edit Day before changing it.");\n      return;\n    }\n`;
if (!s.includes(saveAnchor)) throw new Error("Could not find saveSnapshot anchor");
s = s.replace(saveAnchor, saveInsert);

const deleteAnchor = '  const deleteSnapshot = async () => {\n';
const deleteInsert = `${deleteAnchor}    if (dayClosed) {\n      toast.error("This day is closed. Click Edit Day before deleting a snapshot.");\n      return;\n    }\n`;
if (!s.includes(deleteAnchor)) throw new Error("Could not find deleteSnapshot anchor");
s = s.replace(deleteAnchor, deleteInsert);

const returnAnchor = '  return (\n    <div className="min-h-screen bg-background">';
const helpers = `  const editClosedDay = () => {\n    window.localStorage.removeItem(closeDayKey(shiftDate));\n    setDayClosed(false);\n    toast.info(\`\${dateLabel(shiftDate)} unlocked for editing. Save a new closing snapshot, then close the day again.\`);\n  };\n\n  const closeDay = () => {\n    if (!closing) {\n      toast.error("Save the Closing Snapshot before closing the day.");\n      setPhase("closing");\n      setActiveTab("import");\n      return;\n    }\n\n    const unresolved = metrics.scheduled;\n    if (unresolved > 0) {\n      const ok = window.confirm(\n        \`\${unresolved} TC\${unresolved === 1 ? " is" : "s are"} still pending/overdue. Close \${dateLabel(shiftDate)} anyway?\`,\n      );\n      if (!ok) return;\n    }\n\n    window.localStorage.setItem(closeDayKey(shiftDate), "1");\n    setDayClosed(true);\n\n    const next = new Date(\`\${shiftDate}T00:00:00\`);\n    next.setDate(next.getDate() + 1);\n    const nextDate = [\n      next.getFullYear(),\n      String(next.getMonth() + 1).padStart(2, "0"),\n      String(next.getDate()).padStart(2, "0"),\n    ].join("-");\n\n    toast.success(\`\${dateLabel(shiftDate)} closed. Opening \${dateLabel(nextDate)}.\`);\n    setShiftDate(nextDate);\n    setPhase("opening");\n    setActiveTab("import");\n  };\n\n${returnAnchor}`;
if (!s.includes(returnAnchor)) throw new Error("Could not find return anchor");
s = s.replace(returnAnchor, helpers);

const badgeAnchor = `            </Badge>\n          </div>\n        </section>`;
const buttonInsert = `            </Badge>\n            {dayClosed ? (\n              <Button\n                type="button"\n                variant="outline"\n                className="h-10 rounded-xl border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"\n                onClick={editClosedDay}\n              >\n                <ShieldCheck className="size-4" /> Edit Day\n              </Button>\n            ) : (\n              <Button\n                type="button"\n                className="h-10 rounded-xl"\n                onClick={closeDay}\n                disabled={saving || loading}\n              >\n                <CheckCircle2 className="size-4" /> Close Day\n              </Button>\n            )}\n          </div>\n        </section>`;
if (!s.includes(badgeAnchor)) throw new Error("Could not find header badge anchor");
s = s.replace(badgeAnchor, buttonInsert);

// Lock the two CRM paste areas while a historical day is closed.
s = s.replaceAll('                  <Textarea\n                    value={scheduledRaw}', '                  <Textarea\n                    disabled={dayClosed}\n                    value={scheduledRaw}');
s = s.replaceAll('                  <Textarea\n                    value={alignedRaw}', '                  <Textarea\n                    disabled={dayClosed}\n                    value={alignedRaw}');

fs.writeFileSync(file, s, "utf8");
console.log("Installed Close Day -> next day -> Edit Day workflow in", file);
