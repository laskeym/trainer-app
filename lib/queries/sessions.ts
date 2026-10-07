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

  // Without generated DB types supabase-js infers this to-one join as an
  // array; at runtime day_type_template is a single object (or null).
  const template = data.day_type_template as unknown as { template_exercise?: any[] } | null;
  const sortedExercises = (template?.template_exercise ?? [])
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

/**
 * Copies this session's assigned template's TemplateExercise rows into real
 * SessionExercise rows, if that hasn't happened yet. Safe to call every time
 * the session detail screen loads — a no-op once the snapshot already
 * exists. This is the "Phase 2… snapshot and workout-execution lifecycle"
 * getWorkoutSessionDetails's own comment flagged as deferred: SCRUM-30 (set
 * logging) and SCRUM-31 (live per-session exercise edits) both need real,
 * independently-editable SessionExercise rows to work against, and opening
 * the session for the first time is the natural point to materialize them.
 *
 * Deliberately does NOT touch getWorkoutSessionDetails above or its return
 * shape — that function still reads target_sets/target_reps directly off
 * the template for SCRUM-29's plan-preview display, which is correct and
 * unaffected: those columns only ever exist on TemplateExercise, never on
 * SessionExercise, by schema design (a session's actual performance is
 * tracked in SetLog, not as a target).
 */
export async function ensureSessionExercises(sessionId: string, dayTypeTemplateId: string | null) {
  if (!dayTypeTemplateId) return { error: null };

  const { count, error: countError } = await supabase
    .from('session_exercise')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (countError) return { error: countError };
  if (count && count > 0) return { error: null };

  const { data: templateExercises, error: templateError } = await supabase
    .from('template_exercise')
    .select('exercise_id, order')
    .eq('template_id', dayTypeTemplateId)
    .order('order', { ascending: true });

  if (templateError) return { error: templateError };
  if (!templateExercises || templateExercises.length === 0) return { error: null };

  const { error: insertError } = await supabase.from('session_exercise').insert(
    templateExercises.map((te: any) => ({
      session_id: sessionId,
      exercise_id: te.exercise_id,
      order: te.order,
      day_type_template_id: dayTypeTemplateId,
    }))
  );

  return { error: insertError };
}

export type WorkoutSessionStatus = 'planned' | 'in_progress' | 'completed';

/**
 * Moves a session along its planned -> in_progress -> completed lifecycle
 * (or backward, e.g. "Reopen" after an accidental complete — see the status
 * check constraint's own comment for why this isn't a one-way DB-enforced
 * state machine). Returns the updated row so callers can sync local state
 * without a second round trip.
 */
export async function updateWorkoutSessionStatus(sessionId: string, status: WorkoutSessionStatus) {
  const { data, error } = await supabase
    .from('workout_session')
    .update({ status })
    .eq('id', sessionId)
    .select('id, status')
    .single();

  return { data, error };
}

/**
 * The session's actual SessionExercise rows (after ensureSessionExercises
 * has run), joined to their Exercise info. This is the live, per-session
 * exercise list SCRUM-31 will edit independently of the template — distinct
 * from getWorkoutSessionDetails's template-sourced plan preview above.
 */
export async function getSessionExercises(sessionId: string) {
  const { data, error } = await supabase
    .from('session_exercise')
    .select(`
      id,
      order,
      exercise:exercise_id ( id, name, muscle_group, equipment )
    `)
    .eq('session_id', sessionId)
    .order('order', { ascending: true });

  return { data, error };
}

/**
 * Deletes a session outright. session_exercise.session_id and
 * set_log.session_exercise_id both have ON DELETE CASCADE, so this one
 * call also removes every exercise and logged set that belonged to it —
 * no manual child cleanup needed.
 */
export async function deleteWorkoutSession(sessionId: string) {
  const { error } = await supabase.from('workout_session').delete().eq('id', sessionId);
  return { error };
}

/**
 * Minimal read for the edit-session form: just the editable fields plus
 * enough client/template display info to pre-fill the form, not the full
 * exercise plan (getWorkoutSessionDetails already covers that elsewhere).
 */
export async function getWorkoutSessionForEdit(trainerId: string, sessionId: string) {
  const { data, error } = await supabase
    .from('workout_session')
    .select(`
      id,
      day_type_template_id,
      scheduled_start,
      scheduled_end,
      location,
      client:client_id ( id, name ),
      day_type_template:day_type_template_id ( id, name )
    `)
    .eq('id', sessionId)
    .eq('trainer_id', trainerId)
    .single();

  return { data, error };
}

export interface UpdateWorkoutSessionInput {
  dayTypeTemplateId: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  location: string | null;
}

/**
 * Updates a session's schedule/plan-assignment fields. Deliberately has no
 * clientId field — once a session is logged against a client, reassigning
 * it to a different client would leave that client's logged history
 * attached to the wrong person. If a trainer picked the wrong client,
 * delete and recreate the session instead.
 */
export async function updateWorkoutSession(sessionId: string, input: UpdateWorkoutSessionInput) {
  const { data, error } = await supabase
    .from('workout_session')
    .update({
      day_type_template_id: input.dayTypeTemplateId,
      scheduled_start: input.scheduledStart,
      scheduled_end: input.scheduledEnd,
      location: input.location,
    })
    .eq('id', sessionId)
    .select('id')
    .single();

  return { data, error };
}

/**
 * Whether this session has any real logged activity yet — any set with a
 * typed-in value or a confirmed checkmark. Used to decide whether changing
 * the session's workout type needs a destructive-overwrite warning (there's
 * real work to lose) or can just silently reset the plan (there isn't).
 */
export async function hasLoggedActivity(sessionId: string): Promise<{ data: boolean; error: any }> {
  const { data, error } = await supabase
    .from('session_exercise')
    .select('set_log ( weight, reps, completed )')
    .eq('session_id', sessionId);

  if (error) return { data: false, error };

  const hasActivity = (data ?? []).some((se: any) =>
    (se.set_log ?? []).some((log: any) => log.weight != null || log.reps != null || log.completed)
  );

  return { data: hasActivity, error: null };
}

/**
 * Clears this session's SessionExercise rows (and, via cascade, their
 * SetLog rows) when the workout type changes — the old plan and any
 * logged sets against it no longer apply to the newly-assigned template.
 * The next time the session detail screen loads, ensureSessionExercises
 * re-snapshots fresh rows from whatever template is now assigned.
 */
export async function clearSessionExercisesForTemplateChange(sessionId: string) {
  const { error } = await supabase.from('session_exercise').delete().eq('session_id', sessionId);
  return { error };
}

export interface AddSessionExerciseInput {
  sessionId: string;
  exerciseId: string;
  order: number;
  dayTypeTemplateId: string | null;
}

/**
 * Adds an exercise directly to this session's live plan, independent of
 * whatever the assigned template originally specified — e.g. a trainer
 * adding an extra exercise for today only. Tagged with the session's
 * current day_type_template_id (if any), same denormalization the initial
 * template snapshot uses, purely for later recommendation-query
 * convenience — it does not make this row "part of" that template.
 */
export async function addSessionExercise(input: AddSessionExerciseInput) {
  const { data, error } = await supabase
    .from('session_exercise')
    .insert({
      session_id: input.sessionId,
      exercise_id: input.exerciseId,
      order: input.order,
      day_type_template_id: input.dayTypeTemplateId,
    })
    .select(`
      id,
      order,
      exercise:exercise_id ( id, name, muscle_group, equipment )
    `)
    .single();

  return { data, error };
}

/**
 * Removes one exercise from this session's live plan. Cascades to delete
 * any SetLog rows already logged against it (same ON DELETE CASCADE that
 * backs clearSessionExercisesForTemplateChange above).
 */
export async function removeSessionExercise(sessionExerciseId: string) {
  const { error } = await supabase.from('session_exercise').delete().eq('id', sessionExerciseId);
  return { error };
}

/**
 * Persists a full reorder of this session's exercises in one call: pass
 * the SessionExercise rows in their new order, and this writes each row's
 * "order" column to match its new array index (0-based). Same pattern as
 * reorderTemplateExercises in templates.ts, applied to the session's own
 * live exercise list instead of the template's.
 */
export async function reorderSessionExercises(items: { id: string }[]) {
  const results = await Promise.all(
    items.map((item, index) =>
      supabase.from('session_exercise').update({ order: index }).eq('id', item.id)
    )
  );

  const firstError = results.find((r) => r.error)?.error ?? null;
  return { error: firstError };
}
