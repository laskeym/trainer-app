-- session_owner_access only ever checked workout_session.trainer_id, so a
-- trainer could create (or re-point) one of their own sessions at another
-- trainer's client or day_type_template just by knowing its id. The foreign
-- keys are satisfied either way — they don't go through RLS — which made it
-- possible to attach rows to someone else's client and to probe for ids.
--
-- USING is unchanged (it decides which existing rows you can see/touch);
-- WITH CHECK is what a new or updated row has to satisfy.
drop policy "session_owner_access" on workout_session;

create policy "session_owner_access" on workout_session
  for all
  using (trainer_id = auth.uid())
  with check (
    trainer_id = auth.uid()
    and exists (
      select 1 from client
      where client.id = workout_session.client_id
      and client.trainer_id = auth.uid()
    )
    and (
      day_type_template_id is null
      or exists (
        select 1 from day_type_template
        where day_type_template.id = workout_session.day_type_template_id
        and day_type_template.trainer_id = auth.uid()
      )
    )
  );
