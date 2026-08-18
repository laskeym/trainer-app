alter table exercise add column trainer_id uuid references trainer(id);

drop policy "exercise_read_all" on exercise;

create policy "exercise_read_shared_or_own" on exercise
  for select using (
    trainer_id is null or trainer_id = auth.uid()
  );

create policy "exercise_insert_own" on exercise
  for insert with check (
    trainer_id = auth.uid()
  );

create policy "exercise_update_own" on exercise
  for update using (
    trainer_id = auth.uid()
  );

create policy "exercise_delete_own" on exercise
  for delete using (
    trainer_id = auth.uid()
  );
