// __tests__/utils/testFixtures.js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

console.log('FETCH IMPLEMENTATION:', {
  fetchType: global.fetch?.constructor?.name,
  fetchSource: String(global.fetch).slice(0, 200),
  responseType: global.Response?.name,
})

const supabaseUrl =
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321'

const anonKey = process.env.SUPABASE_ANON_KEY

if (!anonKey) {
  throw new Error(
    'SUPABASE_ANON_KEY is not set. Run `supabase status` and configure the test environment.'
  )
}

export async function createTestTrainer() {
  const runId = Date.now() + Math.random()
  const debugFetch = async (input, init) => {
    const response = await fetch(input, init)

    console.log('SUPABASE REQUEST:', {
      url: input,
      status: response?.status,
      contentType: response?.headers?.get?.('content-type'),
      responseType: response?.constructor?.name,
      hasClone: typeof response?.clone === 'function',
      hasText: typeof response?.text === 'function',
    })

    return response
}

console.log('SUPABASE TEST CONFIG:', {
  url: supabaseUrl,
  hasAnonKey: Boolean(anonKey),
  anonKeyLength: anonKey?.length,
})

const client = createClient(supabaseUrl, anonKey, {
  global: {
    fetch: debugFetch,
  },
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
  const { data } = await client
    .from('client')
    .insert({ name: 'Test Client', trainer_id: trainerId, ...overrides })
    .select()
    .single()
  return data
}

export async function createTestWorkoutSession(client, trainerId, clientId, overrides = {}) {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await client
    .from('workout_session')
    .insert({
      trainer_id: trainerId,
      client_id: clientId,
      scheduled_start: `${today}T09:00:00`,
      scheduled_end: `${today}T10:00:00`,
      location: 'Test Gym',
      status: 'planned',
      ...overrides,
    })
    .select()
    .single()
  return data
}