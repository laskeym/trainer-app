create table trainer (
  id uuid primary key references auth.users(id),
  created_at timestamptz default now()
);

create table client (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer(id),
  name text not null,
  created_at timestamptz default now()
);

create table client_metric (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id),
  date date not null,
  weight numeric,
  body_fat_pct numeric,
  height numeric,
  created_at timestamptz default now()
);

create table exercise (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  equipment text
);

create table day_type_template (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer(id),
  name text not null
);

create table template_exercise (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references day_type_template(id) on delete cascade,
  exercise_id uuid not null references exercise(id),
  "order" int not null,
  target_sets int,
  target_reps int
);

create table workout_session (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id),
  trainer_id uuid not null references trainer(id),
  scheduled_date date not null,
  status text not null default 'planned',
  day_type_template_id uuid references day_type_template(id)
);

create table session_exercise (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_session(id) on delete cascade,
  exercise_id uuid not null references exercise(id),
  "order" int not null,
  day_type_template_id uuid references day_type_template(id)
);

create table set_log (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references session_exercise(id) on delete cascade,
  set_number int not null,
  weight numeric,
  reps int
);
