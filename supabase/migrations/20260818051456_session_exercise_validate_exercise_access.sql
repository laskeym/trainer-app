drop policy "session_exercise_owner_access" on session_exercise;

create policy "session_exercise_owner_access" on session_exercise
  for all using (
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
  );
