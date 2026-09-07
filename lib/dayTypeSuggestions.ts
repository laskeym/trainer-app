// lib/dayTypeSuggestions.ts

/**
 * Maps common day-type naming keywords (e.g. a trainer naming a template
 * "Leg Day" or "Push") to the muscle_group values on Exercise rows that are
 * relevant for that kind of day. Used to surface a "Suggested" section at
 * the top of the exercise picker instead of dumping the whole library on
 * the trainer in whatever order it came back in.
 *
 * Keyword matching is intentionally loose (substring match against the
 * template name, lowercased) rather than an exact enum, since trainers name
 * templates freely ("Leg Day", "Legs", "Heavy Leg Day" should all match).
 */
const DAY_TYPE_MUSCLE_GROUPS: Record<string, string[]> = {
  leg: ['Legs', 'Glutes'],
  lower: ['Legs', 'Glutes'],
  glute: ['Glutes', 'Legs'],
  push: ['Chest', 'Shoulders', 'Triceps'],
  pull: ['Back', 'Biceps'],
  upper: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'],
  chest: ['Chest', 'Triceps'],
  back: ['Back', 'Biceps'],
  shoulder: ['Shoulders'],
  arm: ['Biceps', 'Triceps'],
  core: ['Core'],
  abs: ['Core'],
  full: ['Legs', 'Chest', 'Back', 'Shoulders', 'Core'],
  cardio: ['Cardio'],
};

/**
 * Returns the muscle groups relevant to a template's name, based on
 * whatever day-type keywords it contains. Returns an empty array if the
 * name doesn't match any known keyword — callers should treat that as "no
 * suggestions available" rather than an error.
 */
export function getSuggestedMuscleGroups(templateName: string): string[] {
  const lower = templateName.toLowerCase();
  const matched = new Set<string>();

  for (const [keyword, groups] of Object.entries(DAY_TYPE_MUSCLE_GROUPS)) {
    if (lower.includes(keyword)) {
      groups.forEach((g) => matched.add(g));
    }
  }

  return Array.from(matched);
}
