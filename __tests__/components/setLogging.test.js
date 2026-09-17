import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SetLoggingScreen from '../../app/session/[id]/exercise/[sessionExerciseId]';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  getSetLogsForSessionExercise,
  ensureSetLogRows,
  createBlankSetLog,
  updateSetLog,
  deleteSetLog,
  getLastLoggedSets,
} from '../../lib/queries/setLogs';
import { updateWorkoutSessionStatus } from '../../lib/queries/sessions';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({
    id: 'session-1',
    sessionExerciseId: 'session-exercise-1',
    exerciseName: 'Back Squat',
    targetSets: '3',
    targetReps: '10',
    clientId: 'client-1',
    exerciseId: 'exercise-1',
    sessionStatus: 'in_progress',
  })),
}));

jest.mock('../../lib/queries/setLogs', () => ({
  getSetLogsForSessionExercise: jest.fn(),
  ensureSetLogRows: jest.fn(),
  createBlankSetLog: jest.fn(),
  updateSetLog: jest.fn(),
  deleteSetLog: jest.fn(),
  getLastLoggedSets: jest.fn(),
}));

jest.mock('../../lib/queries/sessions', () => ({
  updateWorkoutSessionStatus: jest.fn(),
}));

// The default scenario: ensureSetLogRows already created 3 blank rows for
// this exercise's target-set count, and getSetLogsForSessionExercise reads
// them back — matching what actually happens against a real backend.
const BLANK_ROWS = [
  { id: 'log-1', set_number: 1, weight: null, reps: null, completed: false },
  { id: 'log-2', set_number: 2, weight: null, reps: null, completed: false },
  { id: 'log-3', set_number: 3, weight: null, reps: null, completed: false },
];

describe('Set Logging Screen', () => {
  beforeEach(() => {
    ensureSetLogRows.mockResolvedValue({ error: null });
    getSetLogsForSessionExercise.mockResolvedValue({ data: BLANK_ROWS, error: null });
    getLastLoggedSets.mockResolvedValue({ data: [], error: null });
    updateSetLog.mockResolvedValue({ data: {}, error: null });
    updateWorkoutSessionStatus.mockResolvedValue({ data: { id: 'session-1', status: 'in_progress' }, error: null });
  });

  afterEach(() => jest.clearAllMocks());

  it('pre-populates set rows matching the target sets count on first open', async () => {
    const { findByText, findByTestId } = await render(<SetLoggingScreen />);

    expect(await findByText('Back Squat')).toBeTruthy();
    expect(await findByText('Target: 3 sets \u00d7 10 reps')).toBeTruthy();
    expect(await findByTestId('set-row-1')).toBeTruthy();
    expect(await findByTestId('set-row-2')).toBeTruthy();
    expect(await findByTestId('set-row-3')).toBeTruthy();
    expect(ensureSetLogRows).toHaveBeenCalledWith('session-exercise-1', 3);
  });

  it('shows the last-time reference when a prior session has logged sets for this exercise', async () => {
    getLastLoggedSets.mockResolvedValue({
      data: [
        { set_number: 1, weight: 175, reps: 8 },
        { set_number: 2, weight: 180, reps: 8 },
        { set_number: 3, weight: 185, reps: 6 },
      ],
      error: null,
    });

    const { findByText } = await render(<SetLoggingScreen />);

    expect(await findByText('Last time: 175x8, 180x8, 185x6')).toBeTruthy();
  });

  it('shows a cold-start message when there is no prior session for this exercise', async () => {
    const { findByText } = await render(<SetLoggingScreen />);

    expect(await findByText('No previous session for this exercise yet')).toBeTruthy();
  });

  it('loads previously completed sets and shows them as complete', async () => {
    getSetLogsForSessionExercise.mockResolvedValue({
      data: [{ id: 'log-1', set_number: 1, weight: 135, reps: 12, completed: true }],
      error: null,
    });

    const { findByTestId } = await render(<SetLoggingScreen />);

    expect(await findByTestId('set-row-1')).toBeTruthy();
    expect(await findByTestId('complete-set-1')).toBeTruthy();
    expect(await findByTestId('remove-set-1')).toBeTruthy();
  });

  it('autosaves in-progress values on blur without marking the set complete', async () => {
    const { findByTestId } = await render(<SetLoggingScreen />);

    const weightInput = await findByTestId('weight-input-1');

    await act(async () => {
      fireEvent.changeText(weightInput, '135');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      fireEvent(weightInput, 'blur');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateSetLog).toHaveBeenCalledWith('log-1', {
      weight: 135,
      reps: null,
      completed: false,
    });
  });

  it('logs a set, marks it complete, and does not start a rest timer', async () => {
    const { findByTestId, queryByTestId } = await render(<SetLoggingScreen />);

    const weightInput = await findByTestId('weight-input-1');
    const repsInput = await findByTestId('reps-input-1');

    await act(async () => {
      fireEvent.changeText(weightInput, '135');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      fireEvent.changeText(repsInput, '10');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const completeButton = await findByTestId('complete-set-1');
    await act(async () => {
      fireEvent.press(completeButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateSetLog).toHaveBeenCalledWith('log-1', {
      weight: 135,
      reps: 10,
      completed: true,
    });
    // The checkmark's job is marking the set done — it should never trigger
    // a rest timer as a side effect (that caused accidental taps before).
    expect(queryByTestId('rest-timer-banner')).toBeNull();
  });

  it('un-marks a completed set (persisting the change) without deleting it when tapped again', async () => {
    getSetLogsForSessionExercise.mockResolvedValue({
      data: [{ id: 'log-1', set_number: 1, weight: 135, reps: 12, completed: true }],
      error: null,
    });

    const { findByTestId } = await render(<SetLoggingScreen />);

    const completeButton = await findByTestId('complete-set-1');
    await act(async () => {
      fireEvent.press(completeButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateSetLog).toHaveBeenCalledWith('log-1', { completed: false });
    expect(deleteSetLog).not.toHaveBeenCalled();
  });

  it('auto-starts the session on the first set logged if it was still planned', async () => {
    useLocalSearchParams.mockReturnValue({
      id: 'session-1',
      sessionExerciseId: 'session-exercise-1',
      exerciseName: 'Back Squat',
      targetSets: '3',
      targetReps: '10',
      clientId: 'client-1',
      exerciseId: 'exercise-1',
      sessionStatus: 'planned',
    });

    const { findByTestId } = await render(<SetLoggingScreen />);

    const weightInput = await findByTestId('weight-input-1');
    await act(async () => {
      fireEvent.changeText(weightInput, '135');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const completeButton = await findByTestId('complete-set-1');
    await act(async () => {
      fireEvent.press(completeButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateWorkoutSessionStatus).toHaveBeenCalledWith('session-1', 'in_progress');
  });

  it('creates a real row immediately when Add Set is pressed', async () => {
    createBlankSetLog.mockResolvedValue({
      data: { id: 'log-4', set_number: 4, weight: null, reps: null, completed: false },
      error: null,
    });

    const { findByTestId, queryByTestId } = await render(<SetLoggingScreen />);

    expect(queryByTestId('set-row-4')).toBeNull();

    const addButton = await findByTestId('add-set');
    await act(async () => {
      fireEvent.press(addButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(createBlankSetLog).toHaveBeenCalledWith('session-exercise-1', 4);
    expect(await findByTestId('set-row-4')).toBeTruthy();
  });

  it('removes a set with real data only after the confirmation alert is accepted', async () => {
    getSetLogsForSessionExercise.mockResolvedValue({
      data: [
        { id: 'log-1', set_number: 1, weight: 135, reps: 12, completed: true },
        { id: 'log-2', set_number: 2, weight: 140, reps: 10, completed: false },
      ],
      error: null,
    });
    deleteSetLog.mockResolvedValue({ error: null });

    // Alert.alert doesn't invoke callbacks in the RN test environment, so
    // simulate the trainer tapping the destructive 'Delete' button.
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const deleteButton = buttons.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.();
    });

    const { findByTestId, queryByTestId } = await render(<SetLoggingScreen />);

    const removeFirstButton = await findByTestId('remove-set-1');

    await act(async () => {
      fireEvent.press(removeFirstButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteSetLog).toHaveBeenCalledWith('log-1');
    // What was set 2 should now be renumbered to set 1
    expect(await findByTestId('set-row-1')).toBeTruthy();
    expect(queryByTestId('set-row-2')).toBeNull();
  });

  it('removes a still-blank row immediately, with no confirmation needed', async () => {
    deleteSetLog.mockResolvedValue({ error: null });
    jest.spyOn(Alert, 'alert');

    const { findByTestId, queryByTestId } = await render(<SetLoggingScreen />);

    // All 3 default rows are blank in this test's data.
    const removeThirdButton = await findByTestId('remove-set-3');

    await act(async () => {
      fireEvent.press(removeThirdButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(deleteSetLog).toHaveBeenCalledWith('log-3');
    expect(queryByTestId('set-row-3')).toBeNull();
  });

  it('starts the rest timer directly from a preset button', async () => {
    const { findByTestId } = await render(<SetLoggingScreen />);

    const preset90 = await findByTestId('rest-preset-90');

    await act(async () => {
      fireEvent.press(preset90);
    });

    expect(await findByTestId('rest-timer-banner')).toBeTruthy();
  });
});
