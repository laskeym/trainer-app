// __tests__/integration/rls.test.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY

if (!anonKey) {
  throw new Error('SUPABASE_ANON_KEY is not set — run `supabase status` and export it')
}

const runId = Date.now()
const trainerAEmail = `a+${runId}@test.com`
const trainerBEmail = `b+${runId}@test.com`

let trainerAClient
let trainerBClient

beforeAll(async () => {
  trainerAClient = createClient(supabaseUrl, anonKey)
  trainerBClient = createClient(supabaseUrl, anonKey)

  const { data: signUpAData, error: signUpAError } = await trainerAClient.auth.signUp({
    email: trainerAEmail,
    password: 'password123',
  })
  if (signUpAError) console.log('SIGNUP A ERROR:', signUpAError)

  const { error: signUpBError } = await trainerBClient.auth.signUp({
    email: trainerBEmail,
    password: 'password123',
  })
  if (signUpBError) console.log('SIGNUP B ERROR:', signUpBError)

  const trainerAId = signUpAData.user.id

  const { error: insertError } = await trainerAClient
    .from('client')
    .insert({ name: 'Sara', trainer_id: trainerAId })
  if (insertError) console.log('INSERT ERROR:', insertError)
})

describe('RLS: client table', () => {
  it("trainer cannot see another trainer's clients", async () => {
    const { data, error } = await trainerBClient.from('client').select('*')
    if (error) console.log('QUERY B ERROR:', error)
    expect(data).toHaveLength(0)
  })

  it('trainer can see their own clients', async () => {
    const { data, error } = await trainerAClient.from('client').select('*')
    if (error) console.log('QUERY A ERROR:', error)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].name).toBe('Sara')
  })
})