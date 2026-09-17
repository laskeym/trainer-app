// lib/queries/setLogs.ts
import { supabase } from '../supabase';

export async function getSetLogsForSessionExercise(sessionExerciseId: string) {
  const { data, error } = await supabase
    .from('set_log')
    .select('id, set_number, weight, reps, completed')
    .eq('session_exercise_id', sessionExerciseId)
    .order('set_number', { ascending: true });

  return { data, error };
}

/**
 * Creates one blank SetLog row per target set, if this session_exercise
 * doesn't have any yet. Safe to call every time the set-logging screen
 * loads — a no-op once rows already exist (same idempotent pattern as
 * ensureSessionExercises in sessions.ts). This is what makes an
 * in-progress or still-blank set survive navigating away and back: the row
 * is real from the moment the screen opens, not only once the trainer
 * confirms it complete.
 */
export async function ensureSetLogRows(sessionExerciseId: string, targetSetCount: number) {
  const { count, error: countError } = await supabase
    .from('set_log')
    .select('id', { count: 'exact', head: true })
    .eq('session_exercise_id', sessionExerciseId);

  if (countError) return { error: countError };
  if (count && count > 0) return { error: null };

  const rows = Array.from({ length: Math.max(targetSetCount, 1) }, (_, i) => ({
    session_exercise_id: sessionExerciseId,
    set_number: i + 1,
    weight: null,
    reps: null,
    completed: false,
  }));

  const { error: insertError } = await supabase.from('set_log').insert(rows);
  return { error: insertError };
}

/**
 * Inserts a single new blank row — used by "+ Add Set" so a freshly added
 * set is a real row immediately, same reasoning as ensureSetLogRows above.
 */
export async function createBlankSetLog(sessionExerciseId: string, setNumber: number) {
  const { data, error } = await supabase
    .from('set_log')
    .insert({
      session_exercise_id: sessionExerciseId,
      set_number: setNumber,
      weight: null,
      reps: null,
      completed: false,
    })
    .select()
    .single();

  return { data, error };
}

export interface UpdateSetLogInput {
  weight?: number | null;
  reps?: number | null;
  completed?: boolean;
}

/**
 * Plain update by id — every row a caller has in hand already exists
 * server-side (created via ensureSetLogRows or createBlankSetLog), so
 * there's no more find-or-create branching needed here. Used both for
 * autosaving weight/reps as the trainer types (completed left as-is or
 * explicitly reset to false) and for the checkmark's complete/un-complete
 * toggle (weight/reps left as-is).
 */
export async function updateSetLog(setLogId: string, input: UpdateSetLogInput) {
  const { data, error } = await supabase
    .from('set_log')
    .update(input)
    .eq('id', setLogId)
    .select()
    .single();

  return { data, error };
}

export async function deleteSetLog(setLogId: string) {
  const { error } = await supabase.from('set_log').delete().eq('id', setLogId);
  return { error };
}

/**
 * Every SessionExercise in this session, each with its SetLog rows
 * (including still-blank/in-progress ones and their completed flag) — used
 * by the session detail screen to show actual logging progress ("2/3 sets
 * logged") and full-completion status, instead of always showing the
 * template's static target no matter what actually happened.
 */
export async function getSetLogSummariesForSession(sessionId: string) {
  const { data, error } = await supabase
    .from('session_exercise')
    .select(`
      id,
      exercise_id,
      set_log ( set_number, weight, reps, completed )
    `)
    .eq('session_id', sessionId);

  return { data, error };
}

/**
 * Finds this client's most recent OTHER session containing this exercise
 * (excluding the current session) and returns its logged sets, so the
 * set-logging screen can show a "last time: 175x8, 180x8, 185x6" reference.
 * Only confirmed (completed) sets count as "last time" — a prior session's
 * still-blank or in-progress rows aren't a meaningful reference. Returns an
 * empty array (not an error) when there's no prior session — that's the
 * normal cold-start case, not a failure.
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
    .eq('completed', true)
    .order('set_number', { ascending: true });

  return { data: sets ?? [], error: setsError };
}
