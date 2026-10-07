-- Same gap as workout_session, one level down: session_exercise also carries
-- a day_type_template_id, and nothing stopped it from pointing at another
-- trainer's template. USING is the existing policy verbatim; WITH CHECK adds
-- the template ownership requirement for new/updated rows.
drop policy "session_exercise_owner_access" on session_exercise;

create policy "session_exercise_owner_access" on session_exercise
  for all
  using (
    exists (
      select 1 from workout_session
      where workout_session.id = session_exercise.session_id
      and workout_session.trainer_id = auth.uid()
    )
    and exists (
      select 1 from exercise
      where exercise.id = session_exercise.exercise_id
      and (exercise.trainer_id is null or exercise.trainer_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from workout_session
      where workout_session.id = session_exercise.session_id
      and workout_session.trainer_id = auth.uid()
    )
    and exists (
      select 1 from exercise
      where exercise.id = session_exercise.exercise_id
      and (exercise.trainer_id is null or exercise.trainer_id = auth.uid())
    )
    and (
      day_type_template_id is null
      or exists (
        select 1 from day_type_template
        where day_type_template.id = session_exercise.day_type_template_id
        and day_type_template.trainer_id = auth.uid()
      )
    )
  );
