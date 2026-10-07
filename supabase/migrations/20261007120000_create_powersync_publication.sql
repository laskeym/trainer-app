-- PowerSync reads changes off the Postgres WAL through logical replication.
-- It looks for a publication named exactly `powersync`.
--
-- Only the nine tables the app syncs are listed — not FOR ALL TABLES — so
-- nothing added to this schema later is replicated to PowerSync until it is
-- deliberately added here (and to powersync/sync-streams.yaml).
--
-- The replication role itself is NOT created by a migration: this repo is
-- public and that role needs a password. It is created by hand in the
-- Supabase SQL editor (or by PowerSync's guided setup); see
-- powersync/README.md.
--
-- The publication may already exist on a project that was connected through
-- PowerSync's guided setup, so this is written to be safe to run either way.
do $$
declare
  existing_all_tables boolean;
begin
  select puballtables into existing_all_tables
  from pg_publication
  where pubname = 'powersync';

  if not found then
    create publication powersync for table
      trainer,
      client,
      client_metric,
      exercise,
      day_type_template,
      template_exercise,
      workout_session,
      session_exercise,
      set_log;
  elsif existing_all_tables then
    -- A FOR ALL TABLES publication can't be narrowed in place; it has to be
    -- dropped and recreated, which makes PowerSync replicate from scratch.
    -- That's a deliberate, by-hand step (powersync/README.md), not something
    -- a migration should do behind anyone's back.
    raise notice 'publication "powersync" exists as FOR ALL TABLES - left unchanged, see powersync/README.md';
  else
    alter publication powersync set table
      trainer,
      client,
      client_metric,
      exercise,
      day_type_template,
      template_exercise,
      workout_session,
      session_exercise,
      set_log;
  end if;
end $$;
