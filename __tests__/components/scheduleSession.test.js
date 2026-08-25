import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ScheduleSessionScreen from '../../app/session/new';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { createWorkoutSession } from '../../lib/queries/sessions';
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
