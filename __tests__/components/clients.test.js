import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ClientsScreen from '../../app/(tabs)/clients';
import { useRouter, useFocusEffect } from 'expo-router';
import { getClientsForTrainer } from '../../lib/queries/clients';

// Mock expo-router push handlers cleanly. useFocusEffect must behave like an
// effect hook (component calls it on mount) or the screen's fetch never runs.
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
  useFocusEffect: (effect) => require('react').useEffect(effect, []),
}));

// lib/supabase.ts calls createClient(...) at module scope, which throws
// outside a real env — mock it so it never loads for component tests
// (same pattern as lib/queries below; see handoff's "hard-won lessons").
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-trainer-id' } } }),
    },
  },
}));

jest.mock('../../lib/queries/clients', () => ({
  getClientsForTrainer: jest.fn(),
}));

const MOCK_CLIENTS = [
  { id: 'client-1', name: 'Paul Jones', goals: 'Strength training', constraint: 'None' },
  { id: 'client-2', name: 'Sarah Jenkins', goals: 'Weight loss', constraint: 'Sciatica' },
];

describe('Clients Screen Directory', () => {
  beforeEach(() => {
    getClientsForTrainer.mockResolvedValue({ data: MOCK_CLIENTS, error: null });
  });

  afterEach(() => jest.clearAllMocks());

  it('renders the core screen title and client profile search bar', async () => {
    const { findByText, findByPlaceholderText } = await render(<ClientsScreen />);

    expect(await findByText('My Clients')).toBeTruthy();
    expect(await findByPlaceholderText('Search by client name...')).toBeTruthy();

    // Let the mocked fetchClientDirectory() promise settle (setClients/
    // setLoading) inside this test's act() scope, rather than letting it
    // resolve after teardown and warn from the next test.
    await findByText('Paul Jones');
  });

  it('filters active member cards dynamically based on search text entries', async () => {
    const { findByPlaceholderText, queryByText, findByText } = await render(<ClientsScreen />);

    const searchInput = await findByPlaceholderText('Search by client name...');

    // Wait for the initial client list to load before filtering
    await findByText('Sarah Jenkins');

    // Type a specific filter string
    fireEvent.changeText(searchInput, 'Paul');

    expect(await findByText('Paul Jones')).toBeTruthy();
    expect(queryByText('Sarah Jenkins')).toBeNull(); // Shuts out non-matching cards
  });

  it('routes trainers to the add profile view layout when clicking the FAB', async () => {
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });

    const { findByText } = await render(<ClientsScreen />);

    // Same as above — wait for the fetch to settle before interacting further.
    await findByText('Paul Jones');

    const addClientButton = await findByText('Add Client');

    fireEvent.press(addClientButton);

    // Verifies it hits the registered root path route destination
    expect(mockPush).toHaveBeenCalledWith('/clients/new');
  });
});