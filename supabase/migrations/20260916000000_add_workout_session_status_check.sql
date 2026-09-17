-- Formalizes the WorkoutSession status lifecycle: planned -> in_progress ->
-- completed. The column already defaults to 'planned' and every existing
-- row uses that value, so this constraint doesn't require a backfill.
--
-- 'planned'     — scheduled, not yet started
-- 'in_progress' — the trainer has started logging sets this session
-- 'completed'   — the trainer explicitly marked the session done
--
-- A session can move backward too (e.g. "Reopen" after an accidental
-- complete), so this is a plain allow-list, not a one-way state machine
-- enforced at the DB level — the app layer decides which transitions make
-- sense to expose.
alter table workout_session
  add constraint workout_session_status_check
  check (status in ('planned', 'in_progress', 'completed'));
