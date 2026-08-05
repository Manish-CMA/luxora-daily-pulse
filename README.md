# Luxora Daily Pulse

Build a modern, responsive web application called "Luxora Daily TC Dashboard".

The application is an internal reporting tool used by operations managers to enter daily performance data for teleconsultation coordinators and generate a professional dashboard that can be shared with management.

The design should be clean, minimal, modern and premium.

Use:

- React

- TypeScript

- Tailwind CSS

- shadcn/ui components

- Lucide Icons

Primary colors:

Blue (#2563EB)

White

Light Gray

Success Green

Warning Orange

The dashboard should have rounded cards, soft shadows and look suitable for a corporate operations team.

-----------------------------------

PAGE 1

DATA ENTRY

-----------------------------------

At the top create:

Date (Date Picker)

Total Leads Assigned

Total TCs Lined Up

Below create an editable table.

Columns:

Agent Name

Calls Made

Calls Picked Up

Pre-TC

Pre-TC → TC

Pre-TC → PC

PC1 (Without Pre-TC)

Default agents:

Manav

Vandita

Meenu

Himanshu

Aman

Allow:

+ Add Agent

Delete Agent

Every field should accept only numbers except Agent Name.

-----------------------------------

AUTO CALCULATIONS

-----------------------------------

Automatically calculate:

Total Calls Made

Total Calls Picked Up

Total Pre-TCs

Total Pre-TC → TC

Total Pre-TC → PC

Total PC1

Pickup Rate %

= Calls Picked / Calls Made

Pre-TC → TC %

= Pre-TC→TC / Pre-TC

Pre-TC → PC %

= Pre-TC→PC / Pre-TC

Display these in KPI cards.

-----------------------------------

TOP PERFORMER

-----------------------------------

Automatically determine the top performer.

Priority:

Highest Pre-TC→TC

If tie:

Highest Pre-TC→PC

If tie:

Highest Calls Picked

Show a premium card with trophy icon.

-----------------------------------

LEADERBOARD

-----------------------------------

Create leaderboard cards for:

Most Calls Made

Most Calls Picked

Most Pre-TCs

Most Pre-TC→TC

Most Pre-TC→PC

Most PC1 (Without Pre-TC)

-----------------------------------

GENERATE SNAPSHOT

-----------------------------------

Add a button:

Generate Dashboard

When clicked, open a beautiful dashboard preview.

The preview should contain:

Luxora Daily TC Dashboard

Selected Date

Top KPI cards

Agent Performance Table

Team Summary

Conversion Rates

Top Performer

Daily Leaderboard

This preview should be designed like a professional business report.

-----------------------------------

EXPORTS

-----------------------------------

Buttons:

Download PNG

Download PDF

Copy Dashboard

Print Dashboard

-----------------------------------

GENERAL

-----------------------------------

Use local storage so all entered values remain after refresh.

Everything should update automatically without pressing Save.

The application should work perfectly on desktop.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://luxora-insight.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e0ef47ef-4c4d-48a8-8d95-1f556c0f551e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
