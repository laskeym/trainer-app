-- SetLog rows are now created up front (one per target set, or one on
-- demand via "+ Add Set") the moment a trainer opens an exercise's logging
-- screen — not just when they tap the checkmark. That means a row's mere
-- existence no longer implies the trainer confirmed it: a still-blank or
-- in-progress row is a real row too, so it survives navigating away and
-- back. `completed` is what the checkmark actually toggles, and it's what
-- distinguishes "recorded so far" from "trainer confirmed this set is
-- done" both on this screen and on the session-level progress display.
alter table set_log
  add column completed boolean not null default false;
