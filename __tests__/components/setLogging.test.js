import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SetLoggingScreen from '../../app/session/[id]/exercise/[sessionExerciseId]';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  getSetLogsForSessionExercise,
  upsertSetLog,
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
  upsertSetLog: jest.fn(),
  deleteSetLog: jest.fn(),
  getLastLoggedSets: jest.fn(),
}));

jest.mock('../../lib/queries/sessions', () => ({
  updateWorkoutSessionStatus: jest.fn(),
}));

describe('Set Logging Screen', () => {
  beforeEach(() => {
    getSetLogsForSessionExercise.mockResolvedValue({ data: [], error: null });
    getLastLoggedSets.mockResolvedValue({ data: [], error: null });
    updateWorkoutSessionStatus.mockResolvedValue({ data: { id: 'session-1', status: 'in_progress' }, error: null });
  });

  afterEach(() => jest.clearAllMocks());

  it('pre-populates empty set rows matching the target sets count when nothing is logged yet', async () => {
    const { findByText, findByTestId } = await render(<SetLoggingScreen />);

    expect(await findByText('Back Squat')).toBeTruthy();
    expect(await findByText('Target: 3 sets \u00d7 10 reps')).toBeTruthy();
    expect(await findByTestId('set-row-1')).toBeTruthy();
    expect(await findByTestId('set-row-2')).toBeTruthy();
    expect(await findByTestId('set-row-3')).toBeTruthy();
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

  it('loads previously logged sets and shows them as already complete', async () => {
    getSetLogsForSessionExercise.mockResolvedValue({
      data: [{ id: 'log-1', set_number: 1, weight: 135, reps: 12 }],
      error: null,
    });

    const { findByTestId } = await render(<SetLoggingScreen />);

    expect(await findByTestId('set-row-1')).toBeTruthy();
    // A saved set always shows both the complete toggle and a remove action —
    // the checkmark no longer morphs away once logged.
    expect(await findByTestId('complete-set-1')).toBeTruthy();
    expect(await findByTestId('remove-set-1')).toBeTruthy();
  });

  it('logs a set, marks it complete, and does not start a rest timer', async () => {
    upsertSetLog.mockResolvedValue({ data: { id: 'log-9' }, error: null });

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

    expect(upsertSetLog).toHaveBeenCalledWith({
      sessionExerciseId: 'session-exercise-1',
      setNumber: 1,
      weight: 135,
      reps: 10,
    });
    // The checkmark's job is marking the set done — it should never trigger
    // a rest timer as a side effect (that caused accidental taps before).
    expect(queryByTestId('rest-timer-banner')).toBeNull();
  });

  it('un-marks a completed set locally without deleting it when tapped again', async () => {
    getSetLogsForSessionExercise.mockResolvedValue({
      data: [{ id: 'log-1', set_number: 1, weight: 135, reps: 12 }],
      error: null,
    });

    const { findByTestId } = await render(<SetLoggingScreen />);

    const completeButton = await findByTestId('complete-set-1');
    fireEvent.press(completeButton);

    // Un-marking is a local-only toggle — no delete call, no data loss.
    expect(deleteSetLog).not.toHaveBeenCalled();
    expect(upsertSetLog).not.toHaveBeenCalled();
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
    upsertSetLog.mockResolvedValue({ data: { id: 'log-9' }, error: null });

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

  it('adds a new empty set row when Add Set is pressed', async () => {
    const { findByTestId, queryByTestId } = await render(<SetLoggingScreen />);

    expect(queryByTestId('set-row-4')).toBeNull();

    const addButton = await findByTestId('add-set');
    fireEvent.press(addButton);

    expect(await findByTestId('set-row-4')).toBeTruthy();
  });

  it('removes a saved set only after the confirmation alert is accepted', async () => {
    getSetLogsForSessionExercise.mockResolvedValue({
      data: [
        { id: 'log-1', set_number: 1, weight: 135, reps: 12 },
        { id: 'log-2', set_number: 2, weight: 140, reps: 10 },
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

  it('removes an unsaved empty row immediately, with no confirmation needed', async () => {
    const { findByTestId, queryByTestId } = await render(<SetLoggingScreen />);

    // Row 3 is an empty, never-logged row from the default 3-set pre-fill.
    const removeThirdButton = await findByTestId('remove-set-3');

    await act(async () => {
      fireEvent.press(removeThirdButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteSetLog).not.toHaveBeenCalled();
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
