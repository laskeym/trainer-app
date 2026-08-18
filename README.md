# Trainer App

A mobile app for personal trainers to track clients, log workouts, and schedule sessions.

## Tech Stack

- **Frontend:** React Native (Expo, Navigation TypeScript template)
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime)
- **Offline sync:** WatermelonDB
- **Testing:** Jest / Vitest, Supabase CLI local stack

## Getting Started

### Prerequisites

- Node.js
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (required for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli): `npm install -g supabase`
- Expo Go app (for testing on a physical device)

### Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy the example env file and fill in your Supabase project values:
   ```bash
   cp .env.example .env
   ```

3. Log in to Supabase and link the project:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

4. Start the app:
   ```bash
   npx expo start
   ```
   Scan the QR code with Expo Go, or press `i` / `a` for a simulator.

## Database & Migrations

Schema and RLS policies live in `supabase/migrations/` and are version-controlled — never edit tables directly in the Supabase dashboard.

### Local development

```bash
supabase start       # spin up local Postgres/Auth/Storage via Docker
supabase db reset     # wipe local DB and replay ALL migrations from scratch
supabase migration up # apply only pending migrations to local (no wipe)
```

Use **`db reset`** as your default while iterating — it guarantees local matches what a fresh install of your full migration history would produce, rather than local state that only exists because of manual fixes.

### Remote (your real Supabase project)

```bash
supabase db push     # applies pending migrations to the REMOTE project
```

**`db push` never touches local, and `db reset` / `migration up` never touch remote.** Test locally first with `db reset`, confirm behavior, then `db push` when you're ready to ship the change.

### Creating a new migration

```bash
supabase migration new <name>
```
Write the SQL in the generated file under `supabase/migrations/`, then apply it locally with `db reset` before pushing to remote.

## Testing

- **Unit tests:** exercise recommendation logic, WatermelonDB sync/conflict handling.
- **RLS / integration tests:** run against the local Supabase stack (`supabase start`), verifying trainers can only access their own data. Reset local (`supabase db reset`) before each test run for a clean slate.

```bash
npm test
```

## Environment Variables

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) API key |

Never commit `.env` — it's gitignored. Use `.env.example` (blank values) so collaborators know what to set.

## Project Tracking

Epics and stories are tracked in Jira under the `SCRUM` project.
