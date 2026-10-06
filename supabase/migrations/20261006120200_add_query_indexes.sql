-- Postgres doesn't index foreign key columns on its own, and every one of
-- these is hit twice over: by the app's own filters/joins and by the RLS
-- policies' ownership subqueries, which run for each row touched.
create index idx_client_trainer_id on client(trainer_id);
create index idx_client_metric_client_id on client_metric(client_id);
create index idx_day_type_template_trainer_id on day_type_template(trainer_id);
create index idx_template_exercise_template_id on template_exercise(template_id);

-- Leading trainer_id serves the RLS check; (trainer_id, client_id,
-- scheduled_start) covers a trainer's schedule for one client in date order.
create index idx_workout_session_trainer_client_start
  on workout_session(trainer_id, client_id, scheduled_start);

create index idx_session_exercise_session_exercise
  on session_exercise(session_id, exercise_id);
create index idx_set_log_session_exercise_id on set_log(session_exercise_id);
