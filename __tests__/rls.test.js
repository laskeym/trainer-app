// __tests__/rls.test.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const anonKey = '<local anon key from `supabase status`>'

let trainerAClient
let trainerBClient

beforeAll(async () => {
  trainerAClient = createClient(supabaseUrl, anonKey)
  trainerBClient = createClient(supabaseUrl, anonKey)

  // signUp -> auth.users row -> trigger auto-creates matching `trainer` row
  await trainerAClient.auth.signUp({ email: 'a@test.com', password: 'password123' })
  await trainerBClient.auth.signUp({ email: 'b@test.com', password: 'password123' })

  // insert runs AS trainer A's authenticated session, so trainer_id is
  // implicitly satisfied by the insert RLS policy checking auth.uid()
  await trainerAClient.from('client').insert({ name: 'Sara' })
})

describe('RLS: client table', () => {
  it("trainer cannot see another trainer's clients", async () => {
    const { data } = await trainerBClient.from('client').select('*')
    expect(data).toHaveLength(0)
  })

  it('trainer can see their own clients', async () => {
    const { data } = await trainerAClient.from('client').select('*')
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].name).toBe('Sara')
  })
})