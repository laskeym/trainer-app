drop policy "template_exercise_owner_access" on template_exercise;

create policy "template_exercise_owner_access" on template_exercise
  for all using (
    exists (
      select 1 from day_type_template
      where day_type_template.id = template_exercise.template_id
      and day_type_template.trainer_id = auth.uid()
    )
    and exists (
      select 1 from exercise
      where exercise.id = template_exercise.exercise_id
      and (exercise.trainer_id is null or exercise.trainer_id = auth.uid())
    )
  );
