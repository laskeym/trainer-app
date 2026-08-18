alter table trainer enable row level security;
create policy "trainer_self_access" on trainer
  for all using (id = auth.uid());

alter table client enable row level security;
create policy "client_owner_access" on client
  for all using (trainer_id = auth.uid());

alter table client_metric enable row level security;
create policy "client_metric_owner_access" on client_metric
  for all using (
    exists (
      select 1 from client
      where client.id = client_metric.client_id
      and client.trainer_id = auth.uid()
    )
  );

alter table exercise enable row level security;
create policy "exercise_read_all" on exercise
  for select using (auth.role() = 'authenticated');

alter table day_type_template enable row level security;
create policy "template_owner_access" on day_type_template
  for all using (trainer_id = auth.uid());

alter table template_exercise enable row level security;
create policy "template_exercise_owner_access" on template_exercise
  for all using (
    exists (
      select 1 from day_type_template
      where day_type_template.id = template_exercise.template_id
      and day_type_template.trainer_id = auth.uid()
    )
  );

alter table workout_session enable row level security;
create policy "session_owner_access" on workout_session
  for all using (trainer_id = auth.uid());

alter table session_exercise enable row level security;
create policy "session_exercise_owner_access" on session_exercise
  for all using (
    exists (
      select 1 from workout_session
      where workout_session.id = session_exercise.session_id
      and workout_session.trainer_id = auth.uid()
    )
  );

alter table set_log enable row level security;
create policy "set_log_owner_access" on set_log
  for all using (
    exists (
      select 1 from session_exercise
      join workout_session on workout_session.id = session_exercise.session_id
      where session_exercise.id = set_log.session_exercise_id
      and workout_session.trainer_id = auth.uid()
    )
  );
