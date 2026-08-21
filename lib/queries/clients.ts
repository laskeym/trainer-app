// lib/queries/clients.ts
import { client } from '../supabase';

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
  const { data, error } = await client
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
  const { data, error } = await client
    .from('client')
    .select('id', 'name', 'fitness_goals', 'medical_constraints')
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

/**
 * 3. HEAVY HISTORICAL READ: Runs exclusively when loading the individual profile.
 * Pulls the single client row and joins all timeline tracking entries.
 */
export async function getClientDetailsWithHistory(clientId: string) {
  const { data, error } = await client
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

  const formattedProfile = {
    id: data.id,
    name: data.name,
    height: data.height ? `${data.height} cm` : '--',
    fitnessGoals: data.fitness_goals || 'No goals specified',
    medicalConstraints: data.medical_constraints || 'None',
    metricsHistory: sortedMetrics,
  };

  return { data: formattedProfile, error: null };
}
