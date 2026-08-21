import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AddClientScreen from '../../app/clients/new';
import { useRouter } from 'expo-router';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    back: jest.fn(),
  })),
}));

describe('Add Client Profile Form', () => {
  it('displays the structural parameter inputs correctly for static tracking', async () => {
    const { findByText, findByPlaceholderText } = await render(<AddClientScreen />);

    expect(await findByText('CLIENT FULL NAME')).toBeTruthy();
    expect(await findByPlaceholderText('John Doe')).toBeTruthy();
    expect(await findByText('FITNESS GOAL OR FOCUS')).toBeTruthy();
    expect(await findByText('MEDICAL OR PHYSICAL CONSTRAINTS')).toBeTruthy();
  });

  it('updates form state bindings cleanly and returns the user to the past dashboard view stack', async () => {
    const mockBack = jest.fn();
    useRouter.mockReturnValue({ back: mockBack }); // Clean, valid JavaScript!


    const { findByPlaceholderText, findByText } = await render(<AddClientScreen />);

    const nameInput = await findByPlaceholderText('John Doe');
    const goalsInput = await findByPlaceholderText('Weight loss, Strength training...');
    const submitButton = await findByText('Create Client Profile');

    // Populate attribute properties safely
    fireEvent.changeText(nameInput, 'Marcus Aurelius');
    fireEvent.changeText(goalsInput, 'Stoic endurance & conditioning');
    
    fireEvent.press(submitButton);

    // Asserts form execution yields clean view stack popping transitions
    expect(mockBack).toHaveBeenCalled();
  });
});
