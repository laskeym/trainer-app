import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TemplatesScreen from '../../app/(tabs)/templates';
import { useRouter, useFocusEffect } from 'expo-router';
import { getDayTypeTemplatesWithExerciseCounts } from '../../lib/queries/templates';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
  useFocusEffect: (effect) => require('react').useEffect(effect, []),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-trainer-id' } } }),
    },
  },
}));

jest.mock('../../lib/queries/templates', () => ({
  getDayTypeTemplatesWithExerciseCounts: jest.fn(),
}));

const MOCK_TEMPLATES = [
  { id: 'template-1', name: 'Leg Day', exerciseCount: 4 },
  { id: 'template-2', name: 'Push Day', exerciseCount: 1 },
];

describe('Templates Screen', () => {
  beforeEach(() => {
    getDayTypeTemplatesWithExerciseCounts.mockResolvedValue({ data: MOCK_TEMPLATES, error: null });
  });

  afterEach(() => jest.clearAllMocks());

  it('renders the screen title and each template with its exercise count', async () => {
    const { findByText } = await render(<TemplatesScreen />);

    expect(await findByText('Templates')).toBeTruthy();
    expect(await findByText('Leg Day')).toBeTruthy();
    expect(await findByText('4 exercises')).toBeTruthy();
    expect(await findByText('Push Day')).toBeTruthy();
    // Singular form for a count of exactly 1
    expect(await findByText('1 exercise')).toBeTruthy();
  });

  it('shows an empty state when the trainer has no templates yet', async () => {
    getDayTypeTemplatesWithExerciseCounts.mockResolvedValue({ data: [], error: null });

    const { findByText } = await render(<TemplatesScreen />);

    expect(await findByText('No templates yet. Add one below!')).toBeTruthy();
  });

  it('navigates to the template editor when a template card is tapped', async () => {
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });

    const { findByText } = await render(<TemplatesScreen />);

    const legDayCard = await findByText('Leg Day');
    fireEvent.press(legDayCard);

    expect(mockPush).toHaveBeenCalledWith('/templates/template-1');
  });

  it('routes to the create-template screen when the FAB is pressed', async () => {
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });

    const { findByText } = await render(<TemplatesScreen />);

    // Wait for the list to settle before interacting further
    await findByText('Leg Day');

    const addButton = await findByText('Add Template');
    fireEvent.press(addButton);

    expect(mockPush).toHaveBeenCalledWith('/templates/new');
  });
});
