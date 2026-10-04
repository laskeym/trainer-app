import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ClientProfileDetailsScreen from '../../app/clients/[id]/index';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getClientDetailsWithHistory,
  deleteClient,
  createClientMetric,
  updateClientMetric,
  deleteClientMetric,
} from '../../lib/queries/clients';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ id: 'client-1' })),
  useFocusEffect: (effect) => require('react').useEffect(effect, []),
}));

jest.mock('../../lib/queries/clients', () => ({
  getClientDetailsWithHistory: jest.fn(),
  deleteClient: jest.fn(),
  createClientMetric: jest.fn(),
  updateClientMetric: jest.fn(),
  deleteClientMetric: jest.fn(),
}));

const PROFILE = {
  id: 'client-1',
  name: 'Paul Jones',
  height: '182 cm',
  fitnessGoals: 'Strength training',
  medicalConstraints: 'None',
  currentWeight: '78 kg',
  currentBodyFat: '15%',
  metricsHistory: [
    { id: 'metric-1', date: '2026-09-01', weight: 78, body_fat_pct: 15 },
  ],
};

describe('Client Detail Screen', () => {
  beforeEach(() => {
    useLocalSearchParams.mockReturnValue({ id: 'client-1' });
    getClientDetailsWithHistory.mockResolvedValue({ data: PROFILE, error: null });
    deleteClient.mockResolvedValue({ error: null });
    createClientMetric.mockResolvedValue({ data: { id: 'metric-2' }, error: null });
    updateClientMetric.mockResolvedValue({ data: { id: 'metric-1' }, error: null });
    deleteClientMetric.mockResolvedValue({ error: null });
  });

  afterEach(() => jest.clearAllMocks());

  it('loads and renders the client profile, including current weight and body fat', async () => {
    const { findByText } = await render(<ClientProfileDetailsScreen />);

    expect(await findByText('Paul Jones')).toBeTruthy();
    expect(await findByText('W: 78 kg')).toBeTruthy();
    expect(await findByText('BF: 15%')).toBeTruthy();
    expect(getClientDetailsWithHistory).toHaveBeenCalledWith('client-1');
  });

  it('shows "--" for weight/body fat when no metric history has either value yet', async () => {
    getClientDetailsWithHistory.mockResolvedValue({
      data: { ...PROFILE, currentWeight: '--', currentBodyFat: '--' },
      error: null,
    });

    const { findByText } = await render(<ClientProfileDetailsScreen />);

    expect(await findByText('W: --')).toBeTruthy();
    expect(await findByText('BF: --')).toBeTruthy();
  });

  it('navigates to the edit screen with this client\u2019s id when the edit button is pressed', async () => {
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ back: jest.fn(), push: mockPush });

    const { findByTestId } = await render(<ClientProfileDetailsScreen />);

    const editButton = await findByTestId('edit-client-button');
    fireEvent.press(editButton);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/clients/new',
      params: { editClientId: 'client-1' },
    });
  });

  it('does nothing when delete is pressed and then cancelled', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const cancelButton = buttons.find((b) => b.text === 'Cancel');
      cancelButton?.onPress?.();
    });

    const { findByTestId } = await render(<ClientProfileDetailsScreen />);

    const deleteButton = await findByTestId('delete-client-button');
    fireEvent.press(deleteButton);

    expect(deleteClient).not.toHaveBeenCalled();
  });

  it('deletes the client and navigates back when delete is confirmed', async () => {
    const mockBack = jest.fn();
    useRouter.mockReturnValue({ back: mockBack, push: jest.fn() });

    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const deleteButton = buttons.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.();
    });

    const { findByTestId } = await render(<ClientProfileDetailsScreen />);

    const deleteButton = await findByTestId('delete-client-button');

    await act(async () => {
      fireEvent.press(deleteButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteClient).toHaveBeenCalledWith('client-1');
    expect(mockBack).toHaveBeenCalled();
  });

  it('surfaces an alert and stays on the screen if deletion fails', async () => {
    deleteClient.mockResolvedValue({ error: new Error('Network error') });
    const mockBack = jest.fn();
    useRouter.mockReturnValue({ back: mockBack, push: jest.fn() });

    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      if (buttons) {
        const deleteButton = buttons.find((b) => b.text === 'Delete');
        deleteButton?.onPress?.();
      }
    });

    const { findByTestId } = await render(<ClientProfileDetailsScreen />);

    const deleteButton = await findByTestId('delete-client-button');

    await act(async () => {
      fireEvent.press(deleteButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockBack).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Delete Failed', 'Network error');
  });

  it('renders existing metric history rows', async () => {
    const { findByText } = await render(<ClientProfileDetailsScreen />);

    expect(await findByText('Sep 1, 2026')).toBeTruthy();
    expect(await findByText('78 kg')).toBeTruthy();
    expect(await findByText('15%')).toBeTruthy();
  });

  it('logs a new metric entry and refreshes the profile', async () => {
    const { findByTestId, findByPlaceholderText } = await render(<ClientProfileDetailsScreen />);

    fireEvent.press(await findByTestId('log-metric-button'));

    const weightInput = await findByPlaceholderText('78');
    fireEvent.changeText(weightInput, '80');

    const bodyFatInput = await findByPlaceholderText('15');
    fireEvent.changeText(bodyFatInput, '14');

    const submitButton = await findByTestId('save-metric-submit');

    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(createClientMetric).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-1', weight: 80, bodyFatPct: 14 })
    );
    // Refetches after a successful save
    expect(getClientDetailsWithHistory).toHaveBeenCalledTimes(2);
  });

  it('blocks logging a metric entry with neither weight nor body fat entered', async () => {
    const { findByTestId } = await render(<ClientProfileDetailsScreen />);

    fireEvent.press(await findByTestId('log-metric-button'));

    const submitButton = await findByTestId('save-metric-submit');
    fireEvent.press(submitButton);

    expect(createClientMetric).not.toHaveBeenCalled();
  });

  it('opens an existing metric entry pre-filled for editing, and saves via updateClientMetric', async () => {
    const { findByTestId, findByDisplayValue } = await render(<ClientProfileDetailsScreen />);

    fireEvent.press(await findByTestId('metric-row-metric-1'));

    const weightInput = await findByDisplayValue('78');
    fireEvent.changeText(weightInput, '77');

    const submitButton = await findByTestId('save-metric-submit');

    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateClientMetric).toHaveBeenCalledWith('metric-1', {
      date: '2026-09-01',
      weight: 77,
      bodyFatPct: 15,
    });
    expect(createClientMetric).not.toHaveBeenCalled();
  });

  it('deletes a metric entry only after the confirmation alert is accepted', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const deleteButton = buttons.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.();
    });

    const { findByTestId } = await render(<ClientProfileDetailsScreen />);

    const deleteButton = await findByTestId('delete-metric-metric-1');

    await act(async () => {
      fireEvent.press(deleteButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteClientMetric).toHaveBeenCalledWith('metric-1');
  });

  it('does nothing when metric deletion is cancelled', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const cancelButton = buttons.find((b) => b.text === 'Cancel');
      cancelButton?.onPress?.();
    });

    const { findByTestId } = await render(<ClientProfileDetailsScreen />);

    const deleteButton = await findByTestId('delete-metric-metric-1');
    fireEvent.press(deleteButton);

    expect(deleteClientMetric).not.toHaveBeenCalled();
  });
});
