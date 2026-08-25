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
