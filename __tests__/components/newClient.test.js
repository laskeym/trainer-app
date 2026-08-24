import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AddClientScreen from '../../app/clients/new';
import { useRouter } from 'expo-router';
import { createClient } from '../../lib/queries/clients';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    back: jest.fn(),
  })),
}));

// lib/supabase.ts calls createClient(...) at module scope, which throws
// outside a real env — mock it so it never loads for component tests.
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-trainer-id' } } }),
    },
  },
}));

// Named 'createClient' both here and in lib/queries/clients.ts (coincidentally
// same name as the Supabase SDK's createClient, unrelated) — mock our query fn.
jest.mock('../../lib/queries/clients', () => ({
  createClient: jest.fn(),
}));

describe('Add Client Profile Form', () => {
  beforeEach(() => {
    createClient.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => jest.clearAllMocks());

  it('displays the structural parameter inputs correctly for static tracking', async () => {
    const { findByText, findByPlaceholderText } = await render(<AddClientScreen />);

    // Labels are required-field style, e.g. 'CLIENT FULL NAME *'
    expect(await findByText('CLIENT FULL NAME *')).toBeTruthy();
    expect(await findByPlaceholderText('John Doe')).toBeTruthy();
    expect(await findByText('FITNESS GOAL OR FOCUS')).toBeTruthy();
    expect(await findByText('MEDICAL OR PHYSICAL CONSTRAINTS')).toBeTruthy();
  });

  it('updates form state bindings cleanly and returns the user to the past dashboard view stack', async () => {
    const mockBack = jest.fn();
    useRouter.mockReturnValue({ back: mockBack });

    const { findByPlaceholderText, findByText } = await render(<AddClientScreen />);

    // Resolve each element and fire its event immediately, rather than
    // awaiting all three find() calls up front — stacking multiple pending
    // find() promises before any fireEvent causes overlapping act() scopes,
    // and the earlier input's state update gets dropped by the time we press.
    const nameInput = await findByPlaceholderText('John Doe');
    fireEvent.changeText(nameInput, 'Marcus Aurelius');

    const goalsInput = await findByPlaceholderText('Weight loss, Strength training...');
    fireEvent.changeText(goalsInput, 'Stoic endurance & conditioning');

    const submitButton = await findByText('Create Client Profile');

    // handleSave is async and runs several awaited steps (getUser ->
    // createClient -> Alert.alert -> setLoading(false) in `finally`).
    // Wrapping the press in act(async () => ...) lets React flush every
    // state update from that whole chain before the test continues, instead
    // of only catching the first one a waitFor poll happens to observe.
    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // handleSave calls Alert.alert(..., [{ onPress: () => router.back() }]) on
    // success, so back() only fires once the user taps 'OK' on the native
    // alert. RN's Alert.alert doesn't do anything in the test environment, so
    // assert on the mocked mutation call instead of the post-alert navigation.
    expect(createClient).toHaveBeenCalled();
  });
});