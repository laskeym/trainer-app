import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import SessionDetailScreen from '../../app/session/[id]';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import {
  getWorkoutSessionDetails,
  ensureSessionExercises,
  getSessionExercises,
  updateWorkoutSessionStatus,
} from '../../lib/queries/sessions';
import { getSetLogSummariesForSession } from '../../lib/queries/setLogs';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ id: 'session-1' })),
  useFocusEffect: (effect) => require('react').useEffect(effect, []),
}));

jest.mock('../../lib/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../lib/queries/sessions', () => ({
  getWorkoutSessionDetails: jest.fn(),
  ensureSessionExercises: jest.fn(),
  getSessionExercises: jest.fn(),
  updateWorkoutSessionStatus: jest.fn(),
}));

jest.mock('../../lib/queries/setLogs', () => ({
  getSetLogSummariesForSession: jest.fn(),
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
    getSetLogSummariesForSession.mockResolvedValue({ data: [], error: null });
    updateWorkoutSessionStatus.mockResolvedValue({ data: { id: 'session-1', status: 'in_progress' }, error: null });
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

  it('navigates to the set-logging screen with target info and current status when an exercise is tapped', async () => {
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
        sessionStatus: 'planned',
      },
    });
  });

  it('shows the actual logged sets instead of the target once logging has started', async () => {
    getSetLogSummariesForSession.mockResolvedValue({
      data: [
        {
          id: 'session-exercise-1',
          exercise_id: 'exercise-1',
          set_log: [
            { set_number: 1, weight: 135, reps: 10 },
            { set_number: 2, weight: 140, reps: 8 },
          ],
        },
      ],
      error: null,
    });

    const { findByText, queryByText } = await render(<SessionDetailScreen />);

    expect(await findByText('2/3 sets logged \u00b7 135x10, 140x8')).toBeTruthy();
    expect(queryByText('3 sets × 10 reps')).toBeNull();
  });

  it('shows a Start Workout button for a planned session, and starts it on tap', async () => {
    const { findByTestId } = await render(<SessionDetailScreen />);

    const startButton = await findByTestId('start-workout-button');

    await act(async () => {
      fireEvent.press(startButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateWorkoutSessionStatus).toHaveBeenCalledWith('session-1', 'in_progress');
    expect(await findByTestId('mark-complete-button')).toBeTruthy();
  });

  it('shows a Mark Complete button for an in-progress session, and completes it on tap', async () => {
    getWorkoutSessionDetails.mockResolvedValue({ data: { ...SESSION, status: 'in_progress' }, error: null });
    updateWorkoutSessionStatus.mockResolvedValue({ data: { id: 'session-1', status: 'completed' }, error: null });

    const { findByTestId } = await render(<SessionDetailScreen />);

    const completeButton = await findByTestId('mark-complete-button');

    await act(async () => {
      fireEvent.press(completeButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateWorkoutSessionStatus).toHaveBeenCalledWith('session-1', 'completed');
    expect(await findByTestId('reopen-session-button')).toBeTruthy();
  });

  it('shows a Reopen Session button for a completed session', async () => {
    getWorkoutSessionDetails.mockResolvedValue({ data: { ...SESSION, status: 'completed' }, error: null });

    const { findByTestId } = await render(<SessionDetailScreen />);

    expect(await findByTestId('reopen-session-button')).toBeTruthy();
  });
});
