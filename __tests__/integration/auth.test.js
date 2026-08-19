// __tests__/integration/auth.test.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY

if (!anonKey) {
  throw new Error('SUPABASE_ANON_KEY is not set — run `supabase status` and export it')
}

const runId = Date.now()
const email = `auth-test+${runId}@test.com`
const password = 'password123'

describe('Auth: signup creates a trainer', () => {
  it('creates a matching trainer row on signup (via the DB trigger)', async () => {
    const client = createClient(supabaseUrl, anonKey)

    const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password })
    expect(signUpError).toBeNull()
    expect(signUpData.user).not.toBeNull()

    // the trigger runs server-side, so this authenticated client should
    // now find exactly one trainer row: itself
    const { data: trainerRows, error: trainerError } = await client.from('trainer').select('*')
    expect(trainerError).toBeNull()
    expect(trainerRows).toHaveLength(1)
    expect(trainerRows[0].id).toBe(signUpData.user.id)
  })
})

describe('Auth: sign in', () => {
  it('succeeds with correct credentials', async () => {
    const client = createClient(supabaseUrl, anonKey)
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    expect(error).toBeNull()
    expect(data.session).not.toBeNull()
  })

  it('fails with incorrect password', async () => {
    const client = createClient(supabaseUrl, anonKey)
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: 'wrong-password',
    })
    expect(error).not.toBeNull()
    expect(data.session).toBeNull()
  })
})

describe('Auth: sign out', () => {
  it('clears the session', async () => {
    const client = createClient(supabaseUrl, anonKey)
    await client.auth.signInWithPassword({ email, password })

    const { error } = await client.auth.signOut()
    expect(error).toBeNull()

    const { data } = await client.auth.getSession()
    expect(data.session).toBeNull()
  })
})