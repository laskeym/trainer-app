-- Seed two trainers + a client each (as service role / postgres)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'trainer.a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'trainer.b@test.com');

insert into trainer (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into client (trainer_id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Sara'),
  ('22222222-2222-2222-2222-222222222222', 'Mike');