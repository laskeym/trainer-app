# PowerSync setup

PowerSync keeps an on-device SQLite copy of each trainer's data in sync with
Supabase. Downloads come from the PowerSync service (which reads Postgres
through logical replication); uploads go from the app straight to Supabase
through `supabase-js`, so RLS still guards every write.

Nothing in this folder is secret. The replication role's password must never
be committed — this repository is public.

## 1. Supabase

PowerSync's guided setup (*Set Up with Supabase* in the dashboard) creates
both of the objects below for you, but with access to every table. The
manual versions here are narrower; either works.

**Publication** — created by the migration
`supabase/migrations/20261007120000_create_powersync_publication.sql`
(`supabase db push`). It lists only the nine synced tables. If guided setup
already created the publication as `FOR ALL TABLES`, the migration leaves it
alone. Check with:

```sql
select puballtables from pg_publication where pubname = 'powersync';
```

Narrowing a `FOR ALL TABLES` publication means dropping and recreating it,
after which PowerSync has to replicate from scratch — do it at a quiet
moment, then redeploy the sync streams:

```sql
drop publication powersync;
create publication powersync for table
  trainer, client, client_metric, exercise, day_type_template,
  template_exercise, workout_session, session_exercise, set_log;
```

**Replication role** — run by hand in the Supabase SQL editor, with your own
password in place of the placeholder:

```sql
create role powersync_role with replication bypassrls login password '<your-own-strong-password>';

grant usage on schema public to powersync_role;
grant select on
  public.trainer,
  public.client,
  public.client_metric,
  public.exercise,
  public.day_type_template,
  public.template_exercise,
  public.workout_session,
  public.session_exercise,
  public.set_log
to powersync_role;
```

No `alter default privileges`: a new table is not readable by this role
until it is deliberately granted here and added to the publication.

## 2. PowerSync instance

1. **Database Connection**: paste the Supabase *direct connection* string,
   then set the username to `powersync_role` and the password to the one
   chosen above. Test, then save.
2. **Client Auth**: enable *Use Supabase Auth* and deploy.
3. **Sync Streams**: paste `sync-streams.yaml` from this folder, Validate,
   Deploy.
4. Copy the instance URL (**Connect** in the top bar) into `.env`:

   ```
   EXPO_PUBLIC_POWERSYNC_URL=https://<instance-id>.powersync.journeyapps.com
   EXPO_PUBLIC_USE_LOCAL_SUPABASE=false
   ```

   The instance replicates from the remote Supabase project, so it cannot be
   used together with the local Supabase stack.

## 3. Two-trainer isolation check

`powersync_role` has `BYPASSRLS`, so the queries in `sync-streams.yaml` are
the only thing keeping one trainer's data off another trainer's device.
Re-run this whenever that file changes.

1. Have two trainer accounts, A and B, each with at least one client, one
   template with an exercise, one session with a logged set, one client
   metric and one custom exercise.
2. In a development build, sign in as A and open the spike screen (the sync
   icon at the top of the Clients tab).
3. Wait for "First sync done: yes". Under **Local rows**, every count should
   match what A owns (`exercise` = shared library + A's custom ones).
4. **Isolation check** must read "No foreign rows on this device".
5. Sign out, sign in as B, and repeat steps 3–4. None of A's clients may be
   listed.
