import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SessionDetailScreen from '../../app/session/[id]';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import {
  getWorkoutSessionDetails,
  ensureSessionExercises,
  getSessionExercises,
} from '../../lib/queries/sessions';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ id: 'session-1' })),
}));

jest.mock('../../lib/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../lib/queries/sessions', () => ({
  getWorkoutSessionDetails: jest.fn(),
  ensureSessionExercises: jest.fn(),
  getSessionExercises: jest.fn(),
}));

const SESSION = {
  id: 'session-1',
  status: 'planned',
  scheduled_start: '2026-09-08T14:00:00.000Z',
  scheduled_end: '2026-09-08T15:00:00.000Z',
  location: 'Downtown Gym',
  client: { id: 'client-1', name: 'Paul Jones' },
  day_type_template: { id: 'template-1', name: 'Leg Day' },
  exercises: [
    {
      id: 'template-exercise-1',
      order: 0,
      target_sets: 3,
      target_reps: 10,
      exercise: { id: 'exercise-1', name: 'Back Squat', muscle_group: 'legs', equipment: 'barbell' },
    },
  ],
};

describe('Session Detail Screen', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ session: { user: { id: 'trainer-1' } } });
    useLocalSearchParams.mockReturnValue({ id: 'session-1' });
    getWorkoutSessionDetails.mockResolvedValue({ data: SESSION, error: null });
    ensureSessionExercises.mockResolvedValue({ error: null });
    getSessionExercises.mockResolvedValue({
      data: [{ id: 'session-exercise-1', order: 0, exercise: { id: 'exercise-1', name: 'Back Squat' } }],
      error: null,
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('loads the selected session and renders its workout plan', async () => {
    const { findByText } = await render(<SessionDetailScreen />);

    expect(await findByText('Paul Jones')).toBeTruthy();
    expect(await findByText('Leg Day')).toBeTruthy();
    expect(await findByText('Back Squat')).toBeTruthy();
    expect(await findByText('3 sets × 10 reps')).toBeTruthy();
    expect(getWorkoutSessionDetails).toHaveBeenCalledWith('trainer-1', 'session-1');
  });

  it('renders the no-template state', async () => {
    getWorkoutSessionDetails.mockResolvedValue({
      data: { ...SESSION, day_type_template: null, exercises: [] },
      error: null,
    });

    const { findByText } = await render(<SessionDetailScreen />);
    expect(await findByText('No workout template assigned')).toBeTruthy();
  });

  it('materializes the SessionExercise snapshot for the assigned template', async () => {
    await render(<SessionDetailScreen />);

    expect(ensureSessionExercises).toHaveBeenCalledWith('session-1', 'template-1');
  });

  it('navigates to the set-logging screen with target info when an exercise is tapped', async () => {
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ back: jest.fn(), push: mockPush });

    const { findByTestId } = await render(<SessionDetailScreen />);

    const exerciseCard = await findByTestId('exercise-card-template-exercise-1');
    fireEvent.press(exerciseCard);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session/session-1/exercise/session-exercise-1',
      params: {
        exerciseName: 'Back Squat',
        targetSets: '3',
        targetReps: '10',
        clientId: 'client-1',
        exerciseId: 'exercise-1',
      },
    });
  });
});
