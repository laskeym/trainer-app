import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ClientProfileDetailsScreen from '../../app/clients/[id]/index';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getClientDetailsWithHistory, deleteClient } from '../../lib/queries/clients';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ id: 'client-1' })),
  useFocusEffect: (effect) => require('react').useEffect(effect, []),
}));

jest.mock('../../lib/queries/clients', () => ({
  getClientDetailsWithHistory: jest.fn(),
  deleteClient: jest.fn(),
}));

const PROFILE = {
  id: 'client-1',
  name: 'Paul Jones',
  height: '182 cm',
  fitnessGoals: 'Strength training',
  medicalConstraints: 'None',
  currentWeight: '78 kg',
  currentBodyFat: '15%',
  metricsHistory: [],
};

describe('Client Detail Screen', () => {
  beforeEach(() => {
    useLocalSearchParams.mockReturnValue({ id: 'client-1' });
    getClientDetailsWithHistory.mockResolvedValue({ data: PROFILE, error: null });
    deleteClient.mockResolvedValue({ error: null });
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
});
