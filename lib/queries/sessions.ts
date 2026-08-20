// lib/queries/sessions.ts
import { supabase } from '../supabase'

// lib/queries/sessions.ts
export async function getSessionsForDate(trainerId: string, date: string) {
  const startOfDay = `${date}T00:00:00`
  const endOfDay = `${date}T23:59:59`

  const { data, error } = await supabase
    .from('workout_session')
    .select(`
      id,
      scheduled_start,
      scheduled_end,
      location,
      status,
      client:client_id ( id, name ),
      day_type_template:day_type_template_id ( id, name )
    `)
    .eq('trainer_id', trainerId)
    .gte('scheduled_start', startOfDay)
    .lte('scheduled_start', endOfDay)
    .order('scheduled_start', { ascending: true })
    .order('name', { ascending: true, foreignTable: 'client' })

  return { data, error }
}