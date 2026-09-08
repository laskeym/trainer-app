// lib/queries/setLogs.ts
import { supabase } from '../supabase';

export async function getSetLogsForSessionExercise(sessionExerciseId: string) {
  const { data, error } = await supabase
    .from('set_log')
    .select('id, set_number, weight, reps')
    .eq('session_exercise_id', sessionExerciseId)
    .order('set_number', { ascending: true });

  return { data, error };
}

export interface UpsertSetLogInput {
  sessionExerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
}

/**
 * One row per (session_exercise_id, set_number) from the app's point of
 * view — logging a set the trainer already logged overwrites that set's
 * numbers rather than creating a duplicate. There's no unique constraint
 * enforcing that server-side (schema predates this feature), so this reads
 * first to decide insert vs. update rather than relying on an upsert
 * conflict target.
 */
export async function upsertSetLog(input: UpsertSetLogInput) {
  const { data: existing, error: findError } = await supabase
    .from('set_log')
    .select('id')
    .eq('session_exercise_id', input.sessionExerciseId)
    .eq('set_number', input.setNumber)
    .maybeSingle();

  if (findError) return { data: null, error: findError };

  if (existing) {
    const { data, error } = await supabase
      .from('set_log')
      .update({ weight: input.weight, reps: input.reps })
      .eq('id', existing.id)
      .select()
      .single();
    return { data, error };
  }

  const { data, error } = await supabase
    .from('set_log')
    .insert({
      session_exercise_id: input.sessionExerciseId,
      set_number: input.setNumber,
      weight: input.weight,
      reps: input.reps,
    })
    .select()
    .single();

  return { data, error };
}

export async function deleteSetLog(setLogId: string) {
  const { error } = await supabase.from('set_log').delete().eq('id', setLogId);
  return { error };
}

/**
 * Finds this client's most recent OTHER session containing this exercise
 * (excluding the current session) and returns its logged sets, so the
 * set-logging screen can show a "last time: 175x8, 180x8, 185x6" reference.
 * Returns an empty array (not an error) when there's no prior session —
 * that's the normal cold-start case, not a failure.
 */
export async function getLastLoggedSets(clientId: string, exerciseId: string, excludeSessionId: string) {
  const { data: priorSessionExercise, error: findError } = await supabase
    .from('session_exercise')
    .select('id, workout_session:session_id!inner ( client_id, scheduled_start )')
    .eq('exercise_id', exerciseId)
    .eq('workout_session.client_id', clientId)
    .neq('session_id', excludeSessionId)
    .order('scheduled_start', { ascending: false, foreignTable: 'workout_session' })
    .limit(1)
    .maybeSingle();

  if (findError) return { data: [], error: findError };
  if (!priorSessionExercise) return { data: [], error: null };

  const { data: sets, error: setsError } = await supabase
    .from('set_log')
    .select('set_number, weight, reps')
    .eq('session_exercise_id', priorSessionExercise.id)
    .order('set_number', { ascending: true });

  return { data: sets ?? [], error: setsError };
}
