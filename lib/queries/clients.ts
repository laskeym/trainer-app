// lib/queries/clients.ts
import { supabase } from '../supabase';

export interface CreateClientInput {
  trainerId: string;
  name: string;
  height: number | null;
  fitnessGoals: string | null;
  medicalConstraints: string;
}

/**
 * 1. CREATE MUTATION: Persists a new client record
 */
export async function createClient(input: CreateClientInput) {
  const { data, error } = await supabase
    .from('client')
    .insert({
      trainer_id: input.trainerId,
      name: input.name,
      height: input.height,
      fitness_goals: input.fitnessGoals,
      medical_constraints: input.medicalConstraints,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * 2. LIGHTWEIGHT DIRECTORY READ: Fetches data strictly for the list view screen.
 * This completely isolates your main dashboard feed from historical metric processing.
 */
export async function getClientsForTrainer(trainerId: string) {
  const { data, error } = await supabase
    .from('client')
    .select('id, name, fitness_goals, medical_constraints')
    .eq('trainer_id', trainerId)
    .order('name', { ascending: true });

  if (error) return { data: null, error };

  // Format columns directly into your visual card properties
  const formattedClients = data.map((item: any) => ({
    id: item.id,
    name: item.name,
    goals: item.fitness_goals || 'General Conditioning',
    constraint: item.medical_constraints || 'None',
  }));

  return { data: formattedClients, error: null };
}

export interface UpdateClientInput {
  name: string;
  height: number | null;
  fitnessGoals: string | null;
  medicalConstraints: string;
}

export async function updateClient(clientId: string, input: UpdateClientInput) {
  const { data, error } = await supabase
    .from('client')
    .update({
      name: input.name,
      height: input.height,
      fitness_goals: input.fitnessGoals,
      medical_constraints: input.medicalConstraints,
    })
    .eq('id', clientId)
    .select()
    .single();

  return { data, error };
}

/**
 * Deletes a client outright. client_metric.client_id and
 * workout_session.client_id both cascade (see the
 * cascade_delete_client migration), and workout_session's own cascade down
 * to session_exercise/set_log takes it from there — this one call removes
 * the client's entire record: profile, metric history, and every session.
 */
export async function deleteClient(clientId: string) {
  const { error } = await supabase.from('client').delete().eq('id', clientId);
  return { error };
}

/**
 * Minimal raw read for the edit form. getClientDetailsWithHistory (below)
 * formats values for display (e.g. height as "182 cm"), which isn't useful
 * to pre-fill a numeric input with — this returns the plain stored values
 * instead.
 */
export async function getClientForEdit(clientId: string) {
  const { data, error } = await supabase
    .from('client')
    .select('id, name, height, fitness_goals, medical_constraints')
    .eq('id', clientId)
    .single();

  return { data, error };
}

/**
 * 3. HEAVY HISTORICAL READ: Runs exclusively when loading the individual profile.
 * Pulls the single client row and joins all timeline tracking entries.
 */
export async function getClientDetailsWithHistory(clientId: string) {
  const { data, error } = await supabase
    .from('client')
    .select(`
      id,
      name,
      height,
      fitness_goals,
      medical_constraints,
      client_metric (
        id,
        date,
        weight,
        body_fat_pct
      )
    `)
    .eq('id', clientId)
    .single();

  if (error) return { data: null, error };

  const sortedMetrics = data.client_metric?.sort(
    (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
  ) || [];

  // Most recent entry that actually has each value — a single metric row
  // can have one field filled in without the other, so these are found
  // independently rather than both just reading sortedMetrics[0].
  const latestWeightEntry = sortedMetrics.find((m: any) => m.weight != null);
  const latestBodyFatEntry = sortedMetrics.find((m: any) => m.body_fat_pct != null);

  const formattedProfile = {
    id: data.id,
    name: data.name,
    height: data.height ? `${data.height} cm` : '--',
    fitnessGoals: data.fitness_goals || 'No goals specified',
    medicalConstraints: data.medical_constraints || 'None',
    currentWeight: latestWeightEntry ? `${latestWeightEntry.weight} kg` : '--',
    currentBodyFat: latestBodyFatEntry ? `${latestBodyFatEntry.body_fat_pct}%` : '--',
    metricsHistory: sortedMetrics,
  };

  return { data: formattedProfile, error: null };
}
