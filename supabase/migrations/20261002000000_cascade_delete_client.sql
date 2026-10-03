-- Deleting a client should remove their whole record — metric history and
-- scheduled/completed sessions included — not get blocked by a foreign key
-- violation the first time either of those exists. workout_session already
-- cascades down to session_exercise and set_log, so cascading
-- workout_session.client_id here is enough to clean up that entire chain
-- too, all from a single `delete from client` call.
alter table client_metric
  drop constraint client_metric_client_id_fkey,
  add constraint client_metric_client_id_fkey
    foreign key (client_id) references client(id) on delete cascade;

alter table workout_session
  drop constraint workout_session_client_id_fkey,
  add constraint workout_session_client_id_fkey
    foreign key (client_id) references client(id) on delete cascade;
