// lib/queries/templates.ts
import { supabase } from '../supabase'

/**
 * Lightweight read for populating a day-type/workout-type picker (e.g. when
 * scheduling a session). RLS already scopes this to the trainer's own
 * templates (see template_owner_access policy).
 */
export async function getDayTypeTemplatesForTrainer(trainerId: string) {
  const { data, error } = await supabase
    .from('day_type_template')
    .select('id, name')
    .eq('trainer_id', trainerId)
    .order('name', { ascending: true });

  return { data, error };
}

/**
 * List-view read for the Templates tab: each template plus how many
 * exercises it currently has, so the list can show an "N exercises"
 * subtitle without a second round trip per row. Kept separate from
 * getDayTypeTemplatesForTrainer above so the lightweight picker read (used
 * by the session-scheduling flow) isn't changed.
 */
export async function getDayTypeTemplatesWithExerciseCounts(trainerId: string) {
  const { data, error } = await supabase
    .from('day_type_template')
    .select('id, name, template_exercise(id)')
    .eq('trainer_id', trainerId)
    .order('name', { ascending: true });

  if (error) return { data: null, error };

  const formatted = data.map((t: any) => ({
    id: t.id,
    name: t.name,
    exerciseCount: t.template_exercise?.length ?? 0,
  }));

  return { data: formatted, error: null };
}

export interface CreateDayTypeTemplateInput {
  trainerId: string;
  name: string;
}

export async function createDayTypeTemplate(input: CreateDayTypeTemplateInput) {
  const { data, error } = await supabase
    .from('day_type_template')
    .insert({
      trainer_id: input.trainerId,
      name: input.name,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Full detail read for the template editor screen: the template's own name
 * plus every TemplateExercise row (joined to its Exercise), sorted by the
 * "order" column — not insertion order, since exercises get reordered
 * independently of when they were added.
 */
export async function getDayTypeTemplateWithExercises(templateId: string) {
  const { data, error } = await supabase
    .from('day_type_template')
    .select(`
      id,
      name,
      template_exercise (
        id,
        order,
        target_sets,
        target_reps,
        exercise ( id, name, muscle_group, equipment )
      )
    `)
    .eq('id', templateId)
    .single();

  if (error) return { data: null, error };

  const sortedExercises = (data.template_exercise ?? [])
    .slice()
    .sort((a: any, b: any) => a.order - b.order);

  return {
    data: {
      id: data.id,
      name: data.name,
      exercises: sortedExercises,
    },
    error: null,
  };
}

export interface AddTemplateExerciseInput {
  templateId: string;
  exerciseId: string;
  order: number;
  targetSets: number | null;
  targetReps: number | null;
}

export async function addTemplateExercise(input: AddTemplateExerciseInput) {
  const { data, error } = await supabase
    .from('template_exercise')
    .insert({
      template_id: input.templateId,
      exercise_id: input.exerciseId,
      order: input.order,
      target_sets: input.targetSets,
      target_reps: input.targetReps,
    })
    .select(`
      id,
      order,
      target_sets,
      target_reps,
      exercise ( id, name, muscle_group, equipment )
    `)
    .single();

  return { data, error };
}

export interface UpdateTemplateExerciseTargetsInput {
  targetSets?: number | null;
  targetReps?: number | null;
}

/**
 * Targets are optional per SCRUM-25 ("trainer can leave a bare checklist"),
 * so this only touches whichever of targetSets/targetReps was actually
 * passed, leaving the other column as-is.
 */
export async function updateTemplateExerciseTargets(
  templateExerciseId: string,
  input: UpdateTemplateExerciseTargetsInput
) {
  const updatePayload: Record<string, number | null> = {};
  if ('targetSets' in input) updatePayload.target_sets = input.targetSets ?? null;
  if ('targetReps' in input) updatePayload.target_reps = input.targetReps ?? null;

  const { data, error } = await supabase
    .from('template_exercise')
    .update(updatePayload)
    .eq('id', templateExerciseId)
    .select()
    .single();

  return { data, error };
}

export async function removeTemplateExercise(templateExerciseId: string) {
  const { error } = await supabase
    .from('template_exercise')
    .delete()
    .eq('id', templateExerciseId);

  return { error };
}

/**
 * Persists a full reorder in one call: pass the TemplateExercise rows in
 * their new order, and this writes each row's "order" column to match its
 * new array index (0-based).
 */
export async function reorderTemplateExercises(items: { id: string }[]) {
  const results = await Promise.all(
    items.map((item, index) =>
      supabase.from('template_exercise').update({ order: index }).eq('id', item.id)
    )
  );

  const firstError = results.find((r) => r.error)?.error ?? null;
  return { error: firstError };
}

