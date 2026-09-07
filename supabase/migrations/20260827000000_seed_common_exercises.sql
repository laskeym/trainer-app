-- Seed a starter shared exercise library (trainer_id NULL = visible to every
-- trainer per the exercise_read_shared_or_own RLS policy). Without this, a
-- fresh install has an empty exercise table and every template has to be
-- built entirely from custom exercises typed in by hand.
--
-- muscle_group values here are the vocabulary getSuggestedMuscleGroups()
-- (lib/dayTypeSuggestions.ts) matches against — keep them in sync if either
-- side changes.
insert into exercise (name, muscle_group, equipment) values
  ('Barbell Back Squat', 'Legs', 'Barbell'),
  ('Goblet Squat', 'Legs', 'Dumbbell'),
  ('Romanian Deadlift', 'Legs', 'Barbell'),
  ('Walking Lunge', 'Legs', 'Dumbbell'),
  ('Leg Press', 'Legs', 'Machine'),
  ('Leg Extension', 'Legs', 'Machine'),
  ('Hamstring Curl', 'Legs', 'Machine'),
  ('Calf Raise', 'Legs', 'Machine'),
  ('Hip Thrust', 'Glutes', 'Barbell'),
  ('Glute Bridge', 'Glutes', 'Bodyweight'),
  ('Cable Kickback', 'Glutes', 'Cable'),
  ('Bulgarian Split Squat', 'Glutes', 'Dumbbell'),
  ('Barbell Bench Press', 'Chest', 'Barbell'),
  ('Incline Dumbbell Press', 'Chest', 'Dumbbell'),
  ('Push-Up', 'Chest', 'Bodyweight'),
  ('Cable Fly', 'Chest', 'Cable'),
  ('Chest Dip', 'Chest', 'Bodyweight'),
  ('Pull-Up', 'Back', 'Bodyweight'),
  ('Lat Pulldown', 'Back', 'Machine'),
  ('Barbell Row', 'Back', 'Barbell'),
  ('Seated Cable Row', 'Back', 'Cable'),
  ('Single-Arm Dumbbell Row', 'Back', 'Dumbbell'),
  ('Overhead Press', 'Shoulders', 'Barbell'),
  ('Dumbbell Lateral Raise', 'Shoulders', 'Dumbbell'),
  ('Face Pull', 'Shoulders', 'Cable'),
  ('Arnold Press', 'Shoulders', 'Dumbbell'),
  ('Barbell Curl', 'Biceps', 'Barbell'),
  ('Dumbbell Hammer Curl', 'Biceps', 'Dumbbell'),
  ('Cable Curl', 'Biceps', 'Cable'),
  ('Triceps Pushdown', 'Triceps', 'Cable'),
  ('Overhead Triceps Extension', 'Triceps', 'Dumbbell'),
  ('Close-Grip Bench Press', 'Triceps', 'Barbell'),
  ('Plank', 'Core', 'Bodyweight'),
  ('Hanging Leg Raise', 'Core', 'Bodyweight'),
  ('Cable Woodchopper', 'Core', 'Cable'),
  ('Russian Twist', 'Core', 'Bodyweight'),
  ('Treadmill Intervals', 'Cardio', 'Machine'),
  ('Rowing Machine', 'Cardio', 'Machine'),
  ('Jump Rope', 'Cardio', 'Bodyweight'),
  ('Stationary Bike', 'Cardio', 'Machine');
