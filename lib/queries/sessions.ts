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

/**
 * Fetches sessions across an inclusive [startDate, endDate] range (both
 * 'YYYY-MM-DD'). Used to power the calendar month view (which days have a
 * session, for the dot indicators) and any "upcoming sessions" list.
 */
export async function getSessionsForDateRange(trainerId: string, startDate: string, endDate: string) {
  const rangeStart = `${startDate}T00:00:00`
  const rangeEnd = `${endDate}T23:59:59`

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
    .gte('scheduled_start', rangeStart)
    .lte('scheduled_start', rangeEnd)
    .order('scheduled_start', { ascending: true })

  return { data, error }
}

export interface CreateWorkoutSessionInput {
  trainerId: string;
  clientId: string;
  dayTypeTemplateId: string | null;
  scheduledStart: string; // ISO timestamp
  scheduledEnd: string;   // ISO timestamp
  location: string | null;
}

export async function createWorkoutSession(input: CreateWorkoutSessionInput) {
  const { data, error } = await supabase
    .from('workout_session')
    .insert({
      trainer_id: input.trainerId,
      client_id: input.clientId,
      day_type_template_id: input.dayTypeTemplateId,
      scheduled_start: input.scheduledStart,
      scheduled_end: input.scheduledEnd,
      location: input.location,
      status: 'planned',
    })
    .select('id')
    .single();

  return { data, error };
}
