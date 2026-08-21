import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ClientsScreen from '../../app/(tabs)/clients';
import { useRouter } from 'expo-router';

// Mock expo-router push handlers cleanly
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}));

describe('Clients Screen Directory', () => {
  it('renders the core screen title and client profile search bar', async () => {
    const { findByText, findByPlaceholderText } = await render(<ClientsScreen />);

    expect(await findByText('My Clients')).toBeTruthy();
    expect(await findByPlaceholderText('Search by client name...')).toBeTruthy();
  });

  it('filters active member cards dynamically based on search text entries', async () => {
    const { findByPlaceholderText, queryByText, findByText } = await render(<ClientsScreen />);

    const searchInput = await findByPlaceholderText('Search by client name...');
    
    // Type a specific filter string
    fireEvent.changeText(searchInput, 'Paul');

    expect(await findByText('Paul Jones')).toBeTruthy();
    expect(queryByText('Sarah Jenkins')).toBeNull(); // Shuts out non-matching cards
  });

  it('routes trainers to the add profile view layout when clicking the FAB', async () => {
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });

    const { findByText } = await render(<ClientsScreen />);
    const addClientButton = await findByText('Add Client');

    fireEvent.press(addClientButton);

    // Verifies it hits the registered root path route destination
    expect(mockPush).toHaveBeenCalledWith('/clients/new');
  });
});
