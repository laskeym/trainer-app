// lib/queries/exercises.ts
import { supabase } from '../supabase';

/**
 * The exercise library a trainer can pick from when building a template:
 * shared exercises (trainer_id IS NULL) plus this trainer's own custom ones.
 * RLS (exercise_read_shared_or_own) already scopes this server-side; the
 * .or() filter here just makes that intent explicit, same pattern as the
 * trainer_id filter in getClientsForTrainer.
 */
export async function getExercisesForTrainer(trainerId: string) {
  const { data, error } = await supabase
    .from('exercise')
    .select('id, name, muscle_group, equipment, trainer_id')
    .or(`trainer_id.is.null,trainer_id.eq.${trainerId}`)
    .order('name', { ascending: true });

  return { data, error };
}

export interface CreateExerciseInput {
  trainerId: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
}

/**
 * Adds a custom exercise to this trainer's own library (trainer_id set, not
 * shared with other trainers — see exercise_insert_own RLS policy).
 */
export async function createExercise(input: CreateExerciseInput) {
  const { data, error } = await supabase
    .from('exercise')
    .insert({
      trainer_id: input.trainerId,
      name: input.name,
      muscle_group: input.muscleGroup,
      equipment: input.equipment,
    })
    .select()
    .single();

  return { data, error };
}
