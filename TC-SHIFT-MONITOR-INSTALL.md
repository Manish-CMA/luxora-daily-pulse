# TC Shift Monitor update

This update keeps the existing TanStack Start, Supabase and Cloudflare architecture. It adds a new **TC Shift Monitor** page at `/tc-scheduler`.

## 1. Replace the project files

1. Close the running development terminal in VS Code.
2. Keep a backup copy of the current `Luxora Daily Pulse` folder.
3. Extract this ZIP.
4. Copy all extracted files into the existing `Luxora Daily Pulse` folder and allow Windows to replace matching files.

## 2. Install the Supabase table

1. Open the Supabase project used by this app.
2. Open **SQL Editor** and create a new query.
3. Copy the complete contents of:

   `supabase/migrations/20260811030000_tc_shift_snapshots.sql`

4. Click **Run** once.

The app can temporarily save snapshots in the current browser if this migration has not been run, but the migration is required for shared data across computers.

## 3. Verify locally

Run these commands in the VS Code terminal from the project folder:

```powershell
npm install
npm run build
npm run dev
```

Open the local URL and select **TC Shift Monitor** in the header.

## 4. Deploy to the existing Cloudflare Worker

First confirm that Wrangler is using the Cloudflare account that owns `manish-2d7.workers.dev`:

```powershell
npx wrangler whoami
```

Then deploy:

```powershell
npm run build
npx nitro deploy --prebuilt
```

The production URL remains:

`https://manish-cma-luxora-daily-pulse.manish-2d7.workers.dev`

## 5. Save the update to GitHub

```powershell
git add .
git commit -m "Add TC Shift Monitor"
git push origin main
```

## Daily workflow

1. At shift start, copy the CRM **Scheduled** view and **Aligned** view.
2. Paste both into **Opening Snapshot**, then select **Parse Preview** and **Save Opening Snapshot**.
3. Use **Live Shift Board** and **WhatsApp Preview** during the shift.
4. At shift end, paste the latest two CRM views into **Closing Snapshot** and save.
5. Open **Closing Comparison** to see added TCs, new alignments and status/time/assignment changes.

The parser groups repeated rows by Case ID, preserves reschedule events, and ignores the repeated outcome-button labels copied from the CRM.
