import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ScheduleSessionScreen from '../../app/session/new';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  createWorkoutSession,
  getWorkoutSessionForEdit,
  updateWorkoutSession,
  hasLoggedActivity,
  clearSessionExercisesForTemplateChange,
} from '../../lib/queries/sessions';
import { getClientsForTrainer } from '../../lib/queries/clients';
import { getDayTypeTemplatesForTrainer } from '../../lib/queries/templates';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-trainer-id' } } }),
    },
  },
}));

jest.mock('../../lib/queries/sessions', () => ({
  createWorkoutSession: jest.fn(),
  getWorkoutSessionForEdit: jest.fn(),
  updateWorkoutSession: jest.fn(),
  hasLoggedActivity: jest.fn(),
  clearSessionExercisesForTemplateChange: jest.fn(),
}));

jest.mock('../../lib/queries/clients', () => ({
  getClientsForTrainer: jest.fn(),
}));

jest.mock('../../lib/queries/templates', () => ({
  getDayTypeTemplatesForTrainer: jest.fn(),
}));

const MOCK_CLIENTS = [
  { id: 'client-1', name: 'Paul Jones', goals: 'Strength training', constraint: 'None' },
  { id: 'client-2', name: 'Sarah Jenkins', goals: 'Weight loss', constraint: 'Sciatica' },
];

const MOCK_TEMPLATES = [
  { id: 'template-1', name: 'Leg Day' },
];

describe('Schedule Session Screen', () => {
  beforeEach(() => {
    getClientsForTrainer.mockResolvedValue({ data: MOCK_CLIENTS, error: null });
    getDayTypeTemplatesForTrainer.mockResolvedValue({ data: MOCK_TEMPLATES, error: null });
    createWorkoutSession.mockResolvedValue({ data: { id: 'session-1' }, error: null });
  });

  afterEach(() => jest.clearAllMocks());

  it('renders the form fields once options load', async () => {
    const { findAllByText, findByText } = await render(<ScheduleSessionScreen />);

    // 'Schedule Session' appears twice by design — once as the nav header
    // title, once as the submit button label — so check there are two
    // rather than asking findByText to arbitrate between them.
    expect(await findAllByText('Schedule Session')).toHaveLength(2);
    expect(await findByText('Select a client')).toBeTruthy();
    expect(await findByText('No Template')).toBeTruthy();
  });

  it('opens the client picker and selects a client', async () => {
    const { findByText } = await render(<ScheduleSessionScreen />);

    const clientField = await findByText('Select a client');
    fireEvent.press(clientField);

    const clientOption = await findByText('Paul Jones');
    fireEvent.press(clientOption);

    // The select field should now show the picked client's name
    expect(await findByText('Paul Jones')).toBeTruthy();
  });

  it('schedules a session end-to-end with client + defaults', async () => {
    const { findByText, findByTestId } = await render(<ScheduleSessionScreen />);

    const clientField = await findByText('Select a client');
    fireEvent.press(clientField);
    const clientOption = await findByText('Paul Jones');
    fireEvent.press(clientOption);

    const submitButton = await findByTestId('schedule-session-submit');

    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(createWorkoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        trainerId: 'mock-trainer-id',
        clientId: 'client-1',
        dayTypeTemplateId: null,
      })
    );
  });

  it('blocks submission without a client selected', async () => {
    const { findByTestId } = await render(<ScheduleSessionScreen />);

    const submitButton = await findByTestId('schedule-session-submit');
    fireEvent.press(submitButton);

    expect(createWorkoutSession).not.toHaveBeenCalled();
  });
});

const MOCK_EXISTING_SESSION = {
  id: 'session-1',
  day_type_template_id: 'template-1',
  scheduled_start: new Date(2026, 8, 20, 9, 0, 0).toISOString(),
  scheduled_end: new Date(2026, 8, 20, 10, 0, 0).toISOString(),
  location: 'Downtown Gym',
  client: { id: 'client-1', name: 'Paul Jones' },
  day_type_template: { id: 'template-1', name: 'Leg Day' },
};

describe('Edit Session Screen', () => {
  beforeEach(() => {
    getClientsForTrainer.mockResolvedValue({ data: MOCK_CLIENTS, error: null });
    getDayTypeTemplatesForTrainer.mockResolvedValue({ data: MOCK_TEMPLATES, error: null });
    getWorkoutSessionForEdit.mockResolvedValue({ data: MOCK_EXISTING_SESSION, error: null });
    updateWorkoutSession.mockResolvedValue({ data: { id: 'session-1' }, error: null });
    hasLoggedActivity.mockResolvedValue({ data: false, error: null });
    clearSessionExercisesForTemplateChange.mockResolvedValue({ error: null });
    useLocalSearchParams.mockReturnValue({ editSessionId: 'session-1' });
  });

  afterEach(() => jest.clearAllMocks());

  it('pre-fills the form from the existing session and shows the client as read-only', async () => {
    const { findAllByText, findByText, findByDisplayValue, queryByText } = await render(<ScheduleSessionScreen />);

    expect(await findAllByText('Edit Session')).toHaveLength(1); // nav title only — button says "Save Changes"
    expect(await findByText('Save Changes')).toBeTruthy();
    expect(await findByText('Paul Jones')).toBeTruthy();
    expect(await findByText('Leg Day')).toBeTruthy();
    expect(await findByDisplayValue('Downtown Gym')).toBeTruthy();
    // Client has no picker affordance in edit mode
    expect(queryByText('Select a client')).toBeNull();
  });

  it('saves unrelated edits (e.g. location) without touching the workout plan at all', async () => {
    const { findByText, findByTestId, findByPlaceholderText } = await render(<ScheduleSessionScreen />);

    await findByText('Paul Jones'); // wait for form to settle

    const locationInput = await findByPlaceholderText('Main Floor, Studio B...');
    fireEvent.changeText(locationInput, 'Uptown Gym');

    const submitButton = await findByTestId('edit-session-submit');
    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Template unchanged — no activity check, no plan reset, straight update
    expect(hasLoggedActivity).not.toHaveBeenCalled();
    expect(clearSessionExercisesForTemplateChange).not.toHaveBeenCalled();
    expect(updateWorkoutSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ dayTypeTemplateId: 'template-1', location: 'Uptown Gym' })
    );
  });

  it('silently resets the plan when the workout type changes and nothing has been logged yet', async () => {
    hasLoggedActivity.mockResolvedValue({ data: false, error: null });
    jest.spyOn(Alert, 'alert');

    const { findByText, findByTestId } = await render(<ScheduleSessionScreen />);

    await findByText('Leg Day');
    fireEvent.press(await findByText('Leg Day'));
    fireEvent.press(await findByText('No Template'));

    const submitButton = await findByTestId('edit-session-submit');
    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(hasLoggedActivity).toHaveBeenCalledWith('session-1');
    expect(Alert.alert).not.toHaveBeenCalledWith('Change Workout Type?', expect.anything(), expect.anything());
    expect(clearSessionExercisesForTemplateChange).toHaveBeenCalledWith('session-1');
    expect(updateWorkoutSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ dayTypeTemplateId: null })
    );
  });

  it('warns before changing the workout type when the session already has logged sets, and does nothing if cancelled', async () => {
    hasLoggedActivity.mockResolvedValue({ data: true, error: null });
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const cancelButton = buttons.find((b) => b.text === 'Cancel');
      cancelButton?.onPress?.();
    });

    const { findByText, findByTestId } = await render(<ScheduleSessionScreen />);

    await findByText('Leg Day');
    fireEvent.press(await findByText('Leg Day'));
    fireEvent.press(await findByText('No Template'));

    const submitButton = await findByTestId('edit-session-submit');
    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Change Workout Type?',
      expect.stringContaining('logged sets'),
      expect.anything()
    );
    expect(clearSessionExercisesForTemplateChange).not.toHaveBeenCalled();
    expect(updateWorkoutSession).not.toHaveBeenCalled();
  });

  it('clears the plan and updates once the trainer confirms the workout-type-change warning', async () => {
    hasLoggedActivity.mockResolvedValue({ data: true, error: null });
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const confirmButton = buttons.find((b) => b.text === 'Change & Clear');
      confirmButton?.onPress?.();
    });

    const { findByText, findByTestId } = await render(<ScheduleSessionScreen />);

    await findByText('Leg Day');
    fireEvent.press(await findByText('Leg Day'));
    fireEvent.press(await findByText('No Template'));

    const submitButton = await findByTestId('edit-session-submit');
    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(clearSessionExercisesForTemplateChange).toHaveBeenCalledWith('session-1');
    expect(updateWorkoutSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ dayTypeTemplateId: null })
    );
  });
});
