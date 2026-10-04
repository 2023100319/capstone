# Ericahlicious

Inventory management for **Ericahlicious Brew and Bake**, a single-branch café in
Malolos, Bulacan.

Staff sign in, manage ingredients and menu items, keep recipes, upload the day's
sales from Excel to deduct stock, and read reports. The store runs its own POS, so
the ordering and payment half of this app is built but switched off.

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Prisma 7 · MySQL (Aiven) ·
NextAuth v4 · Vercel

## Getting started

```bash
npm install
npx prisma generate
npm run dev          # http://localhost:3001
```

You need a `.env` with `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` and
`UPLOADTHING_TOKEN`. It is gitignored and never committed — ask for a copy.

Sign in at [`/staff`](http://localhost:3001/staff). One screen for every role; the
account decides which dashboard you land on.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3001 |
| `npm run build` | `prisma generate` then `next build` |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type-check |
| `npm run db:backup` | Restorable `.sql` dump into `backups/` |
| `npm run test-imports` | Regenerate the sample sales spreadsheets |

**Kill the dev server before building** — it holds port 3001 and the build pulls
`.next` out from under it.

## Documentation

- **[`AGENTS.md`](AGENTS.md)** — the rules. Read first, whether you are a person or
  a model.
- **[`docs/`](docs/README.md)** — architecture, data model, database operations,
  domain rules, workflows, decisions, troubleshooting.

Three things worth knowing before you change anything:

1. **This folder is not a git repository.** Deletions are permanent. The
   `../ericahlicious-25percent/`, `-50percent/` and `-75percent/` siblings are the
   only history.
2. **The database is live client data**, shared, with no automatic backups. Run
   `npm run db:backup` before any schema work, and read
   [`docs/03-database-operations.md`](docs/03-database-operations.md) before
   running any Prisma migration command.
3. **Half the app is deliberately switched off**, not dead. See
   [`docs/06-decisions.md`](docs/06-decisions.md).
