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

/**
 * Full detail read for a single scheduled workout session. The trainerId
 * predicate is intentional even though RLS also protects the row: it keeps
 * this function's ownership contract explicit and prevents callers from
 * accidentally treating another trainer's session as a valid route target.
 *
 * Phase 1 renders the assigned template directly. We deliberately do not
 * create session_exercise rows here yet; Phase 2 will define the snapshot and
 * workout-execution lifecycle so opening a session remains a read-only action.
 */
export async function getWorkoutSessionDetails(trainerId: string, sessionId: string) {
  const { data, error } = await supabase
    .from('workout_session')
    .select(`
      id,
      status,
      scheduled_start,
      scheduled_end,
      location,
      client:client_id ( id, name ),
      day_type_template:day_type_template_id (
        id,
        name,
        template_exercise (
          id,
          order,
          target_sets,
          target_reps,
          exercise:exercise_id ( id, name, muscle_group, equipment )
        )
      )
    `)
    .eq('id', sessionId)
    .eq('trainer_id', trainerId)
    .single();

  if (error) return { data: null, error };

  const sortedExercises = (data.day_type_template?.template_exercise ?? [])
    .slice()
    .sort((a: any, b: any) => a.order - b.order);

  return {
    data: {
      ...data,
      exercises: sortedExercises,
    },
    error: null,
  };
}
