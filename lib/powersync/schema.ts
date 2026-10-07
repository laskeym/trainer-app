// lib/powersync/schema.ts
import { column, Schema, Table } from '@powersync/react-native';

// The on-device SQLite mirror of the nine synced Postgres tables. PowerSync
// adds the `id` (text) primary key to every table on its own, so it's never
// listed here. SQLite only has text/integer/real, so on the way down:
//   uuid, date, timestamptz -> text
//   numeric                 -> real
//   boolean                 -> integer (0/1)
// Postgres defaults (gen_random_uuid(), now(), 'None', 'planned', false)
// don't run locally — a row inserted on-device only has what the insert
// statement gave it until it has round-tripped through Supabase.

const trainer = new Table({
  created_at: column.text,
});

const client = new Table(
  {
    trainer_id: column.text,
    name: column.text,
    height: column.real,
    fitness_goals: column.text,
    medical_constraints: column.text,
    created_at: column.text,
  },
  { indexes: { trainer: ['trainer_id'] } }
);

const client_metric = new Table(
  {
    client_id: column.text,
    date: column.text,
    weight: column.real,
    body_fat_pct: column.real,
    created_at: column.text,
  },
  { indexes: { client: ['client_id'] } }
);

const exercise = new Table(
  {
    // null = shared library exercise, otherwise the owning trainer's custom one
    trainer_id: column.text,
    name: column.text,
    muscle_group: column.text,
    equipment: column.text,
  },
  { indexes: { trainer: ['trainer_id'] } }
);

const day_type_template = new Table(
  {
    trainer_id: column.text,
    name: column.text,
  },
  { indexes: { trainer: ['trainer_id'] } }
);

const template_exercise = new Table(
  {
    template_id: column.text,
    exercise_id: column.text,
    order: column.integer,
    target_sets: column.integer,
    target_reps: column.integer,
  },
  { indexes: { template: ['template_id'] } }
);

const workout_session = new Table(
  {
    client_id: column.text,
    trainer_id: column.text,
    status: column.text,
    day_type_template_id: column.text,
    location: column.text,
    scheduled_start: column.text,
    scheduled_end: column.text,
  },
  { indexes: { trainer_client_start: ['trainer_id', 'client_id', 'scheduled_start'] } }
);

const session_exercise = new Table(
  {
    session_id: column.text,
    exercise_id: column.text,
    order: column.integer,
    day_type_template_id: column.text,
  },
  { indexes: { session_exercise: ['session_id', 'exercise_id'] } }
);

const set_log = new Table(
  {
    session_exercise_id: column.text,
    set_number: column.integer,
    weight: column.real,
    reps: column.integer,
    completed: column.integer,
  },
  { indexes: { session_exercise: ['session_exercise_id'] } }
);

export const AppSchema = new Schema({
  trainer,
  client,
  client_metric,
  exercise,
  day_type_template,
  template_exercise,
  workout_session,
  session_exercise,
  set_log,
});

export type Database = (typeof AppSchema)['types'];
export type ClientRecord = Database['client'];
