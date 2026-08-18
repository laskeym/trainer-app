grant usage on schema public to authenticated;

grant select, insert, update, delete on
  trainer,
  client,
  client_metric,
  exercise,
  day_type_template,
  template_exercise,
  workout_session,
  session_exercise,
  set_log
to authenticated;
