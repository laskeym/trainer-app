// __tests__/utils/testFixtures.js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321'

const anonKey = process.env.SUPABASE_ANON_KEY

if (!anonKey) {
  throw new Error(
    'SUPABASE_ANON_KEY is not set. Run `supabase status` and configure the test environment.'
  )
}

// Every table protected by RLS, parents before children.
export const RLS_TABLES = [
  'trainer',
  'client',
  'client_metric',
  'exercise',
  'day_type_template',
  'template_exercise',
  'workout_session',
  'session_exercise',
  'set_log',
]

// Fixtures fail loudly: a silently-missing row would make every "trainer B
// can't see it" assertion pass for the wrong reason.
async function insertRow(client, table, row) {
  const { data, error } = await client.from(table).insert(row).select().single()
  if (error) {
    throw new Error(`fixture insert into ${table} failed: ${error.message}`)
  }
  return data
}

export async function createTestTrainer() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const email = `trainer+${runId}@test.com`
  const password = 'password123'

  const { data, error } = await client.auth.signUp({
    email,
    password
  })

  if (error) {
    throw new Error(
      `createTestTrainer signUp failed: ${error.message}`
    )
  }

  if (!data.user) {
    throw new Error('createTestTrainer signUp returned no user')
  }

  if (!data.session) {
    throw new Error(
      'createTestTrainer signUp returned no session. Check local Supabase email confirmation settings.'
    )
  }

  return {
    client,
    session: data.session,
    trainerId: data.user.id,
  }
}

export async function createTestClient(client, trainerId, overrides = {}) {
  return insertRow(client, 'client', {
    name: 'Test Client',
    trainer_id: trainerId,
    ...overrides,
  })
}

export async function createTestClientMetric(client, clientId, overrides = {}) {
  const today = new Date().toISOString().split('T')[0]
  return insertRow(client, 'client_metric', {
    client_id: clientId,
    date: today,
    weight: 180,
    body_fat_pct: 20,
    ...overrides,
  })
}

// A trainer's own (private) exercise. Shared exercises have trainer_id NULL
// and only come from migrations — see getSharedExercise.
export async function createTestExercise(client, trainerId, overrides = {}) {
  return insertRow(client, 'exercise', {
    name: 'Test Exercise',
    muscle_group: 'Legs',
    equipment: 'Barbell',
    trainer_id: trainerId,
    ...overrides,
  })
}

export async function getSharedExercise(client) {
  const { data, error } = await client
    .from('exercise')
    .select('*')
    .is('trainer_id', null)
    .order('name')
    .limit(1)
    .single()
  if (error) {
    throw new Error(`getSharedExercise failed: ${error.message}`)
  }
  return data
}

export async function createTestTemplate(client, trainerId, overrides = {}) {
  return insertRow(client, 'day_type_template', {
    name: 'Test Template',
    trainer_id: trainerId,
    ...overrides,
  })
}

export async function createTestTemplateExercise(client, templateId, exerciseId, overrides = {}) {
  return insertRow(client, 'template_exercise', {
    template_id: templateId,
    exercise_id: exerciseId,
    order: 1,
    target_sets: 3,
    target_reps: 10,
    ...overrides,
  })
}

export async function createTestWorkoutSession(client, trainerId, clientId, overrides = {}) {
  const today = new Date().toISOString().split('T')[0]
  return insertRow(client, 'workout_session', {
    trainer_id: trainerId,
    client_id: clientId,
    scheduled_start: `${today}T09:00:00`,
    scheduled_end: `${today}T10:00:00`,
    location: 'Test Gym',
    status: 'planned',
    ...overrides,
  })
}

export async function createTestSessionExercise(client, sessionId, exerciseId, overrides = {}) {
  return insertRow(client, 'session_exercise', {
    session_id: sessionId,
    exercise_id: exerciseId,
    order: 1,
    ...overrides,
  })
}

export async function createTestSetLog(client, sessionExerciseId, overrides = {}) {
  return insertRow(client, 'set_log', {
    session_exercise_id: sessionExerciseId,
    set_number: 1,
    weight: 135,
    reps: 8,
    ...overrides,
  })
}

// Signs up a fresh trainer and gives them one row in every RLS-protected
// table. `rows` is keyed by table name (see RLS_TABLES) so tests can loop
// over tables.
export async function createTrainerWithData(label = 'Trainer') {
  const { client, session, trainerId } = await createTestTrainer()

  const { data: trainerRow, error } = await client
    .from('trainer')
    .select('*')
    .eq('id', trainerId)
    .single()
  if (error) {
    throw new Error(`createTrainerWithData could not read trainer row: ${error.message}`)
  }

  const clientRow = await createTestClient(client, trainerId, { name: `${label} Client` })
  const metric = await createTestClientMetric(client, clientRow.id)
  const exercise = await createTestExercise(client, trainerId, { name: `${label} Exercise` })
  const template = await createTestTemplate(client, trainerId, { name: `${label} Template` })
  const templateExercise = await createTestTemplateExercise(client, template.id, exercise.id)
  const workoutSession = await createTestWorkoutSession(client, trainerId, clientRow.id, {
    day_type_template_id: template.id,
  })
  const sessionExercise = await createTestSessionExercise(client, workoutSession.id, exercise.id, {
    day_type_template_id: template.id,
  })
  const setLog = await createTestSetLog(client, sessionExercise.id)

  return {
    client,
    session,
    trainerId,
    rows: {
      trainer: trainerRow,
      client: clientRow,
      client_metric: metric,
      exercise,
      day_type_template: template,
      template_exercise: templateExercise,
      workout_session: workoutSession,
      session_exercise: sessionExercise,
      set_log: setLog,
    },
  }
}
