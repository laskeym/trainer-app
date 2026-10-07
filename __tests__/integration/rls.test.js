// __tests__/integration/rls.test.js
import {
  RLS_TABLES,
  createTrainerWithData,
  createTestClient,
  createTestSessionExercise,
  createTestTemplate,
  createTestTemplateExercise,
  createTestWorkoutSession,
  getSharedExercise,
} from '../utils/testFixtures'

// Postgres "insufficient_privilege" — what PostgREST surfaces when a row
// fails a policy's WITH CHECK.
const RLS_VIOLATION = '42501'

// A harmless column change per table, used to prove an UPDATE aimed at
// someone else's row doesn't land.
const UPDATE_PATCH = {
  trainer: { created_at: '2000-01-01T00:00:00+00:00' },
  client: { name: 'Hijacked' },
  client_metric: { weight: 1 },
  exercise: { name: 'Hijacked' },
  day_type_template: { name: 'Hijacked' },
  template_exercise: { target_sets: 99 },
  workout_session: { location: 'Hijacked' },
  session_exercise: { order: 99 },
  set_log: { reps: 99 },
}

const today = new Date().toISOString().split('T')[0]

let a
let b
let sharedExercise

// What trainer B would send to plant a row under trainer A's data.
let foreignInserts

beforeAll(async () => {
  a = await createTrainerWithData('A')
  b = await createTrainerWithData('B')
  sharedExercise = await getSharedExercise(a.client)

  foreignInserts = {
    trainer: { id: a.trainerId },
    client: { name: 'Planted', trainer_id: a.trainerId },
    client_metric: { client_id: a.rows.client.id, date: today, weight: 1 },
    exercise: { name: 'Planted', trainer_id: a.trainerId },
    day_type_template: { name: 'Planted', trainer_id: a.trainerId },
    template_exercise: {
      template_id: a.rows.day_type_template.id,
      exercise_id: sharedExercise.id,
      order: 2,
    },
    workout_session: {
      trainer_id: a.trainerId,
      client_id: a.rows.client.id,
      scheduled_start: `${today}T09:00:00`,
    },
    session_exercise: {
      session_id: a.rows.workout_session.id,
      exercise_id: sharedExercise.id,
      order: 2,
    },
    set_log: { session_exercise_id: a.rows.set_log.session_exercise_id, set_number: 2 },
  }
}, 30000)

async function fetchRow(client, table, id) {
  const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle()
  expect(error).toBeNull()
  return data
}

function expectRlsViolation({ data, error }) {
  expect(data).toBeNull()
  expect(error).not.toBeNull()
  expect(error.code).toBe(RLS_VIOLATION)
}

async function countRows(client, table, column, value) {
  const { data, error } = await client.from(table).select('id').eq(column, value)
  expect(error).toBeNull()
  return data.length
}

describe.each(RLS_TABLES)('RLS: %s', (table) => {
  it('owner can read their own row', async () => {
    const row = await fetchRow(a.client, table, a.rows[table].id)
    expect(row).toEqual(a.rows[table])
  })

  it("another trainer cannot select the owner's row", async () => {
    const byId = await fetchRow(b.client, table, a.rows[table].id)
    expect(byId).toBeNull()

    const { data: all, error } = await b.client.from(table).select('id')
    expect(error).toBeNull()
    // B does have rows of their own, so an empty list isn't what we're after
    expect(all.map((row) => row.id)).toContain(b.rows[table].id)
    expect(all.map((row) => row.id)).not.toContain(a.rows[table].id)
  })

  it("another trainer cannot insert a row under the owner's data", async () => {
    const result = await b.client.from(table).insert(foreignInserts[table]).select()
    expectRlsViolation(result)
  })

  it("another trainer cannot update the owner's row", async () => {
    const { data, error } = await b.client
      .from(table)
      .update(UPDATE_PATCH[table])
      .eq('id', a.rows[table].id)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    expect(await fetchRow(a.client, table, a.rows[table].id)).toEqual(a.rows[table])
  })

  it("another trainer cannot delete the owner's row", async () => {
    const { data, error } = await b.client
      .from(table)
      .delete()
      .eq('id', a.rows[table].id)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    expect(await fetchRow(a.client, table, a.rows[table].id)).toEqual(a.rows[table])
  })
})

// Moving one of your own rows underneath another trainer's data is the same
// attack as inserting there, just via UPDATE.
describe("RLS: a trainer cannot re-point their own rows at another trainer's data", () => {
  const cases = [
    ['client', () => ({ trainer_id: a.trainerId })],
    ['client_metric', () => ({ client_id: a.rows.client.id })],
    ['exercise', () => ({ trainer_id: a.trainerId })],
    ['day_type_template', () => ({ trainer_id: a.trainerId })],
    ['template_exercise', () => ({ template_id: a.rows.day_type_template.id })],
    ['template_exercise', () => ({ exercise_id: a.rows.exercise.id })],
    ['workout_session', () => ({ trainer_id: a.trainerId })],
    ['workout_session', () => ({ client_id: a.rows.client.id })],
    ['workout_session', () => ({ day_type_template_id: a.rows.day_type_template.id })],
    ['session_exercise', () => ({ session_id: a.rows.workout_session.id })],
    ['session_exercise', () => ({ exercise_id: a.rows.exercise.id })],
    ['session_exercise', () => ({ day_type_template_id: a.rows.day_type_template.id })],
    ['set_log', () => ({ session_exercise_id: a.rows.session_exercise.id })],
  ]

  it.each(cases)('%s', async (table, buildPatch) => {
    const patch = buildPatch()
    const result = await b.client.from(table).update(patch).eq('id', b.rows[table].id).select()
    expectRlsViolation(result)

    expect(await fetchRow(b.client, table, b.rows[table].id)).toEqual(b.rows[table])
  })
})

describe('RLS: exercise library', () => {
  it('shared exercises are readable by every trainer', async () => {
    for (const trainer of [a, b]) {
      const row = await fetchRow(trainer.client, 'exercise', sharedExercise.id)
      expect(row).toEqual(sharedExercise)
      expect(row.trainer_id).toBeNull()
    }
  })

  it('shared exercises cannot be updated', async () => {
    const { data, error } = await b.client
      .from('exercise')
      .update({ name: 'Hijacked' })
      .eq('id', sharedExercise.id)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    expect(await fetchRow(a.client, 'exercise', sharedExercise.id)).toEqual(sharedExercise)
  })

  it('shared exercises cannot be claimed by a trainer', async () => {
    const { data, error } = await b.client
      .from('exercise')
      .update({ trainer_id: b.trainerId })
      .eq('id', sharedExercise.id)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    expect(await fetchRow(a.client, 'exercise', sharedExercise.id)).toEqual(sharedExercise)
  })

  it('shared exercises cannot be deleted', async () => {
    const { data, error } = await b.client
      .from('exercise')
      .delete()
      .eq('id', sharedExercise.id)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    expect(await fetchRow(a.client, 'exercise', sharedExercise.id)).toEqual(sharedExercise)
  })

  it('a trainer cannot add a new shared exercise', async () => {
    const result = await b.client
      .from('exercise')
      .insert({ name: 'Planted Shared', trainer_id: null })
      .select()
    expectRlsViolation(result)
  })

  it('a trainer cannot turn their own exercise into a shared one', async () => {
    const result = await b.client
      .from('exercise')
      .update({ trainer_id: null })
      .eq('id', b.rows.exercise.id)
      .select()
    expectRlsViolation(result)
  })

  it('a trainer can use shared exercises in their own templates and sessions', async () => {
    const templateExercise = await createTestTemplateExercise(
      b.client,
      b.rows.day_type_template.id,
      sharedExercise.id,
      { order: 2 }
    )
    expect(templateExercise.exercise_id).toBe(sharedExercise.id)

    const sessionExercise = await createTestSessionExercise(
      b.client,
      b.rows.workout_session.id,
      sharedExercise.id,
      { order: 2 }
    )
    expect(sessionExercise.exercise_id).toBe(sharedExercise.id)
  })

  it("a trainer cannot use another trainer's private exercise", async () => {
    expectRlsViolation(
      await b.client
        .from('template_exercise')
        .insert({
          template_id: b.rows.day_type_template.id,
          exercise_id: a.rows.exercise.id,
          order: 3,
        })
        .select()
    )

    expectRlsViolation(
      await b.client
        .from('session_exercise')
        .insert({
          session_id: b.rows.workout_session.id,
          exercise_id: a.rows.exercise.id,
          order: 3,
        })
        .select()
    )
  })
})

describe('RLS: workout_session must reference the trainer\'s own client and template', () => {
  const sessionFor = (overrides) => ({
    trainer_id: b.trainerId,
    client_id: b.rows.client.id,
    scheduled_start: `${today}T11:00:00`,
    ...overrides,
  })

  it("rejects a session for another trainer's client", async () => {
    const result = await b.client
      .from('workout_session')
      .insert(sessionFor({ client_id: a.rows.client.id }))
      .select()
    expectRlsViolation(result)

    // nothing landed on A's client, visible to A or not
    expect(await countRows(a.client, 'workout_session', 'client_id', a.rows.client.id)).toBe(1)
  })

  it("rejects a session built from another trainer's template", async () => {
    const result = await b.client
      .from('workout_session')
      .insert(sessionFor({ day_type_template_id: a.rows.day_type_template.id }))
      .select()
    expectRlsViolation(result)
  })

  it("rejects a session_exercise tagged with another trainer's template", async () => {
    const result = await b.client
      .from('session_exercise')
      .insert({
        session_id: b.rows.workout_session.id,
        exercise_id: sharedExercise.id,
        order: 4,
        day_type_template_id: a.rows.day_type_template.id,
      })
      .select()
    expectRlsViolation(result)
  })

  it('allows a session for the trainer\'s own client and template', async () => {
    const ownClient = await createTestClient(b.client, b.trainerId, { name: 'B Second Client' })
    const ownTemplate = await createTestTemplate(b.client, b.trainerId, { name: 'B Second Template' })

    const session = await createTestWorkoutSession(b.client, b.trainerId, ownClient.id, {
      day_type_template_id: ownTemplate.id,
    })
    expect(session.client_id).toBe(ownClient.id)
    expect(session.day_type_template_id).toBe(ownTemplate.id)

    // and it can be moved between the trainer's own clients / templates
    const { data, error } = await b.client
      .from('workout_session')
      .update({ client_id: b.rows.client.id, day_type_template_id: b.rows.day_type_template.id })
      .eq('id', session.id)
      .select()
      .single()
    expect(error).toBeNull()
    expect(data.client_id).toBe(b.rows.client.id)
    expect(data.day_type_template_id).toBe(b.rows.day_type_template.id)
  })

  it('allows a session with no template', async () => {
    const session = await createTestWorkoutSession(b.client, b.trainerId, b.rows.client.id, {
      day_type_template_id: null,
    })
    expect(session.day_type_template_id).toBeNull()
  })
})
