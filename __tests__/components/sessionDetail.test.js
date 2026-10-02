import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SessionDetailScreen from '../../app/session/[id]';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import {
  getWorkoutSessionDetails,
  ensureSessionExercises,
  getSessionExercises,
  addSessionExercise,
  removeSessionExercise,
  reorderSessionExercises,
  updateWorkoutSessionStatus,
  deleteWorkoutSession,
} from '../../lib/queries/sessions';
import { getSetLogSummariesForSession } from '../../lib/queries/setLogs';
import { getExercisesForTrainer, createExercise } from '../../lib/queries/exercises';

// Real drag gestures can't be simulated via fireEvent in this test
// environment, so replace the library with a plain-list stand-in and expose
// its onReordered callback for tests to call directly — same approach used
// in templateEditor.test.js.
const mockOnReorderedRef = { current: null };

jest.mock('react-native-draglist', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ data, renderItem, keyExtractor, onReordered, ListHeaderComponent, ListEmptyComponent, ListFooterComponent }) => {
      mockOnReorderedRef.current = onReordered;
      return React.createElement(
        View,
        null,
        ListHeaderComponent || null,
        !data || data.length === 0
          ? ListEmptyComponent || null
          : data.map((item, index) =>
              React.createElement(
                React.Fragment,
                { key: keyExtractor(item, index) },
                renderItem({ item, index, onDragStart: () => {}, onDragEnd: () => {}, isActive: false })
              )
            ),
        ListFooterComponent || null
      );
    },
  };
});

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ id: 'session-1' })),
  useFocusEffect: (effect) => require('react').useEffect(effect, []),
}));

jest.mock('../../lib/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'trainer-1' } } }),
    },
  },
}));

jest.mock('../../lib/queries/sessions', () => ({
  getWorkoutSessionDetails: jest.fn(),
  ensureSessionExercises: jest.fn(),
  getSessionExercises: jest.fn(),
  addSessionExercise: jest.fn(),
  removeSessionExercise: jest.fn(),
  reorderSessionExercises: jest.fn(),
  updateWorkoutSessionStatus: jest.fn(),
  deleteWorkoutSession: jest.fn(),
}));

jest.mock('../../lib/queries/setLogs', () => ({
  getSetLogSummariesForSession: jest.fn(),
}));

jest.mock('../../lib/queries/exercises', () => ({
  getExercisesForTrainer: jest.fn(),
  createExercise: jest.fn(),
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

const LIVE_EXERCISES = [
  { id: 'session-exercise-1', order: 0, exercise: { id: 'exercise-1', name: 'Back Squat', muscle_group: 'legs', equipment: 'barbell' } },
];

const MOCK_LIBRARY = [
  { id: 'exercise-1', name: 'Back Squat', muscle_group: 'legs', equipment: 'barbell', trainer_id: null },
  { id: 'exercise-2', name: 'Deadlift', muscle_group: 'back', equipment: 'barbell', trainer_id: null },
];

describe('Session Detail Screen', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ session: { user: { id: 'trainer-1' } } });
    useLocalSearchParams.mockReturnValue({ id: 'session-1' });
    getWorkoutSessionDetails.mockResolvedValue({ data: SESSION, error: null });
    ensureSessionExercises.mockResolvedValue({ error: null });
    getSessionExercises.mockResolvedValue({ data: LIVE_EXERCISES, error: null });
    getSetLogSummariesForSession.mockResolvedValue({ data: [], error: null });
    getExercisesForTrainer.mockResolvedValue({ data: MOCK_LIBRARY, error: null });
    updateWorkoutSessionStatus.mockResolvedValue({ data: { id: 'session-1', status: 'in_progress' }, error: null });
    deleteWorkoutSession.mockResolvedValue({ error: null });
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

  it('shows a non-blocking note (not an empty-state) when no template is assigned', async () => {
    getWorkoutSessionDetails.mockResolvedValue({
      data: { ...SESSION, day_type_template: null, exercises: [] },
      error: null,
    });

    const { findByText } = await render(<SessionDetailScreen />);

    expect(await findByText(/No workout template assigned/)).toBeTruthy();
    // The live exercise list (independent of the template) still renders normally
    expect(await findByText('Back Squat')).toBeTruthy();
  });

  it('shows the empty-plan state prompting to tap Edit, when not in edit mode', async () => {
    getSessionExercises.mockResolvedValue({ data: [], error: null });

    const { findByText } = await render(<SessionDetailScreen />);

    expect(await findByText('No exercises yet')).toBeTruthy();
    expect(await findByText('Tap Edit above to add exercises to this plan.')).toBeTruthy();
  });

  it('shows the Add Exercise prompt in the empty state once Edit is tapped', async () => {
    getSessionExercises.mockResolvedValue({ data: [], error: null });

    const { findByText, findByTestId } = await render(<SessionDetailScreen />);

    await findByText('No exercises yet');
    fireEvent.press(await findByTestId('plan-edit-toggle'));

    expect(await findByText("Add an exercise below to build today's workout plan.")).toBeTruthy();
  });

  it('materializes the SessionExercise snapshot for the assigned template', async () => {
    await render(<SessionDetailScreen />);

    expect(ensureSessionExercises).toHaveBeenCalledWith('session-1', 'template-1');
  });

  it('navigates to the set-logging screen using the live session_exercise id when an exercise is tapped', async () => {
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ back: jest.fn(), push: mockPush });

    const { findByTestId } = await render(<SessionDetailScreen />);

    const exerciseCardBody = await findByTestId('exercise-card-body-session-exercise-1');
    fireEvent.press(exerciseCardBody);

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

  it('counts only confirmed (checkmarked) sets toward X, not merely filled-in ones', async () => {
    getSetLogSummariesForSession.mockResolvedValue({
      data: [
        {
          id: 'session-exercise-1',
          exercise_id: 'exercise-1',
          set_log: [
            { set_number: 1, weight: 135, reps: 10, completed: true },
            { set_number: 2, weight: 140, reps: 8, completed: false },
            { set_number: 3, weight: 145, reps: 6, completed: false },
            { set_number: 4, weight: 150, reps: 5, completed: false },
            { set_number: 5, weight: 155, reps: 4, completed: false },
          ],
        },
      ],
      error: null,
    });

    const { findByText, queryByText } = await render(<SessionDetailScreen />);

    expect(await findByText('1/5 sets logged \u00b7 135x10')).toBeTruthy();
    expect(queryByText('5/5 sets logged')).toBeNull();
  });

  it('shows an Exercise Complete badge once every set for that exercise is confirmed', async () => {
    getSetLogSummariesForSession.mockResolvedValue({
      data: [
        {
          id: 'session-exercise-1',
          exercise_id: 'exercise-1',
          set_log: [
            { set_number: 1, weight: 135, reps: 10, completed: true },
            { set_number: 2, weight: 140, reps: 8, completed: true },
            { set_number: 3, weight: 145, reps: 6, completed: true },
          ],
        },
      ],
      error: null,
    });

    const { findByText } = await render(<SessionDetailScreen />);

    expect(await findByText('3/3 sets logged \u00b7 135x10, 140x8, 145x6')).toBeTruthy();
    expect(await findByText('Exercise Complete')).toBeTruthy();
  });

  it('falls back to the template target when nothing has happened yet', async () => {
    const { findByText } = await render(<SessionDetailScreen />);

    expect(await findByText('3 sets × 10 reps')).toBeTruthy();
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

  it('navigates to the edit screen with this session\u2019s id when the edit button is pressed', async () => {
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ back: jest.fn(), push: mockPush });

    const { findByTestId } = await render(<SessionDetailScreen />);

    const editButton = await findByTestId('edit-session-button');
    fireEvent.press(editButton);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session/new',
      params: { editSessionId: 'session-1' },
    });
  });

  it('does nothing when delete is pressed and then cancelled', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const cancelButton = buttons.find((b) => b.text === 'Cancel');
      cancelButton?.onPress?.();
    });

    const { findByTestId } = await render(<SessionDetailScreen />);

    const deleteButton = await findByTestId('delete-session-button');
    fireEvent.press(deleteButton);

    expect(deleteWorkoutSession).not.toHaveBeenCalled();
  });

  it('deletes the session and navigates back when delete is confirmed', async () => {
    const mockBack = jest.fn();
    useRouter.mockReturnValue({ back: mockBack, push: jest.fn() });

    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const deleteButton = buttons.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.();
    });

    const { findByTestId } = await render(<SessionDetailScreen />);

    const deleteButton = await findByTestId('delete-session-button');

    await act(async () => {
      fireEvent.press(deleteButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteWorkoutSession).toHaveBeenCalledWith('session-1');
    expect(mockBack).toHaveBeenCalled();
  });

  it('opens the exercise picker and adds an exercise to the live plan', async () => {
    addSessionExercise.mockResolvedValue({
      data: {
        id: 'session-exercise-2',
        order: 1,
        exercise: { id: 'exercise-2', name: 'Deadlift', muscle_group: 'back', equipment: 'barbell' },
      },
      error: null,
    });

    const { findByText, findAllByText, findByTestId } = await render(<SessionDetailScreen />);

    fireEvent.press(await findByTestId('plan-edit-toggle')); // Add Exercise only shows in edit mode
    fireEvent.press(await findByText('Add Exercise'));

    const deadliftRow = await findByText('Deadlift');

    await act(async () => {
      fireEvent.press(deadliftRow);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(addSessionExercise).toHaveBeenCalledWith({
      sessionId: 'session-1',
      exerciseId: 'exercise-2',
      order: 1,
      dayTypeTemplateId: 'template-1',
    });
    expect((await findAllByText('Deadlift')).length).toBeGreaterThan(0);
  });

  it('creates a custom exercise and adds it to the live plan in one step', async () => {
    createExercise.mockResolvedValue({
      data: { id: 'exercise-9', name: 'Sled Push', muscle_group: null, equipment: null, trainer_id: 'trainer-1' },
      error: null,
    });
    addSessionExercise.mockResolvedValue({
      data: {
        id: 'session-exercise-9',
        order: 1,
        exercise: { id: 'exercise-9', name: 'Sled Push', muscle_group: null, equipment: null },
      },
      error: null,
    });

    const { findByText, findByPlaceholderText, findByTestId } = await render(<SessionDetailScreen />);

    fireEvent.press(await findByTestId('plan-edit-toggle')); // Add Exercise only shows in edit mode
    fireEvent.press(await findByText('Add Exercise'));
    fireEvent.press(await findByText("Can't find it? Create a custom exercise"));

    const nameInput = await findByPlaceholderText('Exercise name');
    fireEvent.changeText(nameInput, 'Sled Push');

    const submitButton = await findByTestId('create-custom-exercise-submit');

    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(createExercise).toHaveBeenCalledWith({
      trainerId: 'trainer-1',
      name: 'Sled Push',
      muscleGroup: null,
      equipment: null,
    });
    expect(addSessionExercise).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseId: 'exercise-9' })
    );
  });

  it('removes an exercise from the live plan after the confirmation alert is accepted', async () => {
    removeSessionExercise.mockResolvedValue({ error: null });

    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const removeButton = buttons.find((b) => b.text === 'Remove');
      removeButton?.onPress?.();
    });

    const { findByTestId, queryByText } = await render(<SessionDetailScreen />);

    fireEvent.press(await findByTestId('plan-edit-toggle')); // remove button only shows in edit mode
    const removeButton = await findByTestId('remove-exercise-session-exercise-1');

    await act(async () => {
      fireEvent.press(removeButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(removeSessionExercise).toHaveBeenCalledWith('session-exercise-1');
    expect(queryByText('Back Squat')).toBeNull();
  });

  it('does nothing when remove is pressed and then cancelled', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const cancelButton = buttons.find((b) => b.text === 'Cancel');
      cancelButton?.onPress?.();
    });

    const { findByTestId } = await render(<SessionDetailScreen />);

    fireEvent.press(await findByTestId('plan-edit-toggle'));
    const removeButton = await findByTestId('remove-exercise-session-exercise-1');
    fireEvent.press(removeButton);

    expect(removeSessionExercise).not.toHaveBeenCalled();
  });

  it('hides the drag handle and remove button until Edit is tapped', async () => {
    const { findByText, queryByTestId, findByTestId } = await render(<SessionDetailScreen />);

    await findByText('Back Squat');
    expect(queryByTestId('drag-handle-session-exercise-1')).toBeNull();
    expect(queryByTestId('remove-exercise-session-exercise-1')).toBeNull();

    fireEvent.press(await findByTestId('plan-edit-toggle'));

    expect(await findByTestId('drag-handle-session-exercise-1')).toBeTruthy();
    expect(await findByTestId('remove-exercise-session-exercise-1')).toBeTruthy();
  });

  it('toggles the Edit button label between Edit and Done', async () => {
    const { findByText, findByTestId } = await render(<SessionDetailScreen />);

    const toggle = await findByTestId('plan-edit-toggle');
    expect(await findByText('Edit')).toBeTruthy();

    fireEvent.press(toggle);
    expect(await findByText('Done')).toBeTruthy();

    fireEvent.press(toggle);
    expect(await findByText('Edit')).toBeTruthy();
  });

  it('persists the new order when exercises are reordered', async () => {
    getSessionExercises.mockResolvedValue({
      data: [
        ...LIVE_EXERCISES,
        { id: 'session-exercise-2', order: 1, exercise: { id: 'exercise-2', name: 'Deadlift', muscle_group: 'back', equipment: 'barbell' } },
      ],
      error: null,
    });
    reorderSessionExercises.mockResolvedValue({ error: null });

    const { findByText } = await render(<SessionDetailScreen />);

    await findByText('Back Squat');

    // Moving the item at index 0 (Back Squat) to index 1 swaps the two.
    await act(async () => {
      mockOnReorderedRef.current(0, 1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(reorderSessionExercises).toHaveBeenCalledWith([
      { id: 'session-exercise-2' },
      { id: 'session-exercise-1' },
    ]);
  });

  it('renders a drag handle for each exercise row once in edit mode', async () => {
    const { findByTestId } = await render(<SessionDetailScreen />);

    fireEvent.press(await findByTestId('plan-edit-toggle'));

    expect(await findByTestId('drag-handle-session-exercise-1')).toBeTruthy();
  });
});
