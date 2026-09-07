import React from 'react';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import TemplateEditorScreen from '../../app/templates/[id]/index';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  getDayTypeTemplateWithExercises,
  addTemplateExercise,
  updateTemplateExerciseTargets,
  removeTemplateExercise,
  reorderTemplateExercises,
} from '../../lib/queries/templates';
import { getExercisesForTrainer, createExercise } from '../../lib/queries/exercises';

// Real drag gestures can't be simulated via fireEvent in this test
// environment, so replace the library with a plain-list stand-in and expose
// its onDragEnd callback for tests to call directly — same approach as
// mocking Alert.alert elsewhere in this suite for native-only interactions.
const mockDragEndRef = { current: null };

jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    NestableScrollContainer: ({ children }) => React.createElement(View, null, children),
    ScaleDecorator: ({ children }) => children,
    NestableDraggableFlatList: ({ data, renderItem, keyExtractor, onDragEnd, ListEmptyComponent }) => {
      mockDragEndRef.current = onDragEnd;
      if (!data || data.length === 0) return ListEmptyComponent || null;
      return React.createElement(
        View,
        null,
        data.map((item) =>
          React.createElement(
            React.Fragment,
            { key: keyExtractor(item) },
            renderItem({ item, drag: () => {}, isActive: false })
          )
        )
      );
    },
  };
});

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ id: 'template-1' })),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-trainer-id' } } }),
    },
  },
}));

jest.mock('../../lib/queries/templates', () => ({
  getDayTypeTemplateWithExercises: jest.fn(),
  addTemplateExercise: jest.fn(),
  updateTemplateExerciseTargets: jest.fn(),
  removeTemplateExercise: jest.fn(),
  reorderTemplateExercises: jest.fn(),
}));

jest.mock('../../lib/queries/exercises', () => ({
  getExercisesForTrainer: jest.fn(),
  createExercise: jest.fn(),
}));

const MOCK_TEMPLATE = {
  id: 'template-1',
  name: 'Leg Day',
  exercises: [
    {
      id: 'te-1',
      order: 0,
      target_sets: 3,
      target_reps: 10,
      exercise: { id: 'ex-1', name: 'Squat', muscle_group: 'Legs', equipment: 'Barbell' },
    },
    {
      id: 'te-2',
      order: 1,
      target_sets: null,
      target_reps: null,
      exercise: { id: 'ex-2', name: 'Lunge', muscle_group: 'Legs', equipment: null },
    },
  ],
};

const MOCK_LIBRARY = [
  { id: 'ex-1', name: 'Squat', muscle_group: 'Legs', equipment: 'Barbell', trainer_id: null },
  { id: 'ex-3', name: 'Deadlift', muscle_group: 'Back', equipment: 'Barbell', trainer_id: null },
];

describe('Template Editor Screen', () => {
  beforeEach(() => {
    getDayTypeTemplateWithExercises.mockResolvedValue({ data: MOCK_TEMPLATE, error: null });
    getExercisesForTrainer.mockResolvedValue({ data: MOCK_LIBRARY, error: null });
  });

  afterEach(() => jest.clearAllMocks());

  it('renders the template name and its exercises with saved targets', async () => {
    const { findByText } = await render(<TemplateEditorScreen />);

    expect(await findByText('Leg Day')).toBeTruthy();
    expect(await findByText('Squat')).toBeTruthy();
    expect(await findByText('Legs \u2022 Barbell')).toBeTruthy();
    expect(await findByText('Lunge')).toBeTruthy();
  });

  it('shows an empty state when the template has no exercises yet', async () => {
    getDayTypeTemplateWithExercises.mockResolvedValue({
      data: { id: 'template-1', name: 'Leg Day', exercises: [] },
      error: null,
    });

    const { findByText } = await render(<TemplateEditorScreen />);

    expect(await findByText('No exercises yet. Add some below to build out this template.')).toBeTruthy();
  });

  it('opens the exercise picker and adds an exercise from the library', async () => {
    addTemplateExercise.mockResolvedValue({
      data: {
        id: 'te-3',
        order: 2,
        target_sets: null,
        target_reps: null,
        exercise: { id: 'ex-3', name: 'Deadlift', muscle_group: 'Back', equipment: 'Barbell' },
      },
      error: null,
    });

    const { findByText, findAllByText } = await render(<TemplateEditorScreen />);

    const addButton = await findByText('Add Exercise');
    fireEvent.press(addButton);

    // 'Deadlift' only appears once we search/open the library modal
    const deadliftRow = await findByText('Deadlift');

    await act(async () => {
      fireEvent.press(deadliftRow);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(addTemplateExercise).toHaveBeenCalledWith({
      templateId: 'template-1',
      exerciseId: 'ex-3',
      order: 2,
      targetSets: null,
      targetReps: null,
    });

    // Added exercise now shows in the template's own exercise list too
    expect((await findAllByText('Deadlift')).length).toBeGreaterThan(0);
  });

  it('creates a custom exercise and adds it to the template in one step', async () => {
    createExercise.mockResolvedValue({
      data: { id: 'ex-9', name: 'Sled Push', muscle_group: null, equipment: null, trainer_id: 'mock-trainer-id' },
      error: null,
    });
    addTemplateExercise.mockResolvedValue({
      data: {
        id: 'te-9',
        order: 2,
        target_sets: null,
        target_reps: null,
        exercise: { id: 'ex-9', name: 'Sled Push', muscle_group: null, equipment: null },
      },
      error: null,
    });

    const { findByText, findByPlaceholderText, findByTestId } = await render(<TemplateEditorScreen />);

    fireEvent.press(await findByText('Add Exercise'));
    fireEvent.press(await findByText("Can't find it? Create a custom exercise"));

    const nameInput = await findByPlaceholderText('Exercise name');
    fireEvent.changeText(nameInput, 'Sled Push');

    const submitButton = await findByTestId('create-custom-exercise-submit');

    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(createExercise).toHaveBeenCalledWith({
      trainerId: 'mock-trainer-id',
      name: 'Sled Push',
      muscleGroup: null,
      equipment: null,
    });
    expect(addTemplateExercise).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseId: 'ex-9' })
    );
  });

  it('removes an exercise after the confirmation alert is accepted', async () => {
    removeTemplateExercise.mockResolvedValue({ error: null });

    // Alert.alert doesn't invoke callbacks in the RN test environment, so
    // simulate the trainer tapping the destructive 'Remove' button.
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const removeButton = buttons.find((b) => b.text === 'Remove');
      removeButton?.onPress?.();
    });

    const { findByTestId, queryByText } = await render(<TemplateEditorScreen />);

    const removeButton = await findByTestId('remove-te-1');

    await act(async () => {
      fireEvent.press(removeButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(removeTemplateExercise).toHaveBeenCalledWith('te-1');
    expect(queryByText('Squat')).toBeNull();
  });

  it('persists the new order when a drag-end reorder occurs', async () => {
    reorderTemplateExercises.mockResolvedValue({ error: null });

    const { findByText } = await render(<TemplateEditorScreen />);

    // Wait for the initial render to settle before invoking the mocked
    // library's onDragEnd directly (real drag gestures can't be simulated
    // via fireEvent — see the react-native-draggable-flatlist mock above).
    await findByText('Squat');

    const reordered = [MOCK_TEMPLATE.exercises[1], MOCK_TEMPLATE.exercises[0]];

    await act(async () => {
      mockDragEndRef.current({ data: reordered });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(reorderTemplateExercises).toHaveBeenCalledWith([
      { id: 'te-2' },
      { id: 'te-1' },
    ]);
  });

  it('renders a drag handle for each exercise row', async () => {
    const { findByTestId } = await render(<TemplateEditorScreen />);

    expect(await findByTestId('drag-handle-te-1')).toBeTruthy();
    expect(await findByTestId('drag-handle-te-2')).toBeTruthy();
  });

  it('groups the exercise picker into a Suggested section based on the template name', async () => {
    // 'Leg Day' should surface Legs/Glutes exercises first; 'Deadlift' is
    // muscle_group 'Back' so it belongs under 'All Exercises' instead.
    getExercisesForTrainer.mockResolvedValue({
      data: [
        { id: 'ex-1', name: 'Squat', muscle_group: 'Legs', equipment: 'Barbell', trainer_id: null },
        { id: 'ex-3', name: 'Deadlift', muscle_group: 'Back', equipment: 'Barbell', trainer_id: null },
        { id: 'ex-4', name: 'Hip Thrust', muscle_group: 'Glutes', equipment: 'Barbell', trainer_id: null },
      ],
      error: null,
    });

    const { findByText, getAllByText } = await render(<TemplateEditorScreen />);

    fireEvent.press(await findByText('Add Exercise'));

    expect(await findByText('Suggested for Leg Day')).toBeTruthy();
    expect(await findByText('All Exercises')).toBeTruthy();

    // Squat and Hip Thrust are 'Legs'/'Glutes' — both suggested for a Leg
    // Day template. Deadlift (Back) should not be, but does still appear
    // somewhere in the list (under 'All Exercises').
    expect(getAllByText('Squat').length).toBeGreaterThan(0);
    expect(getAllByText('Hip Thrust').length).toBeGreaterThan(0);
    expect(getAllByText('Deadlift').length).toBeGreaterThan(0);
  });

  it('shows a flat exercise list with no section headers when the template name has no matching day-type keyword', async () => {
    getDayTypeTemplateWithExercises.mockResolvedValue({
      data: { id: 'template-1', name: 'Wednesday Session', exercises: [] },
      error: null,
    });

    const { findByText, queryByText } = await render(<TemplateEditorScreen />);

    fireEvent.press(await findByText('Add Exercise'));

    expect(await findByText('Squat')).toBeTruthy();
    expect(queryByText(/^Suggested for/)).toBeNull();
    expect(queryByText('All Exercises')).toBeNull();
  });

  it('saves target sets/reps when the input loses focus', async () => {
    updateTemplateExerciseTargets.mockResolvedValue({ data: {}, error: null });

    const { findByTestId } = await render(<TemplateEditorScreen />);

    const card = await findByTestId('template-exercise-te-2');

    // te-2 has two '—' placeholder inputs (sets, reps) — scope the query to
    // this card so we don't accidentally grab te-1's inputs.
    const allDashInputs = within(card).getAllByPlaceholderText('\u2014');

    // Each step gets its own act() so React re-renders (and handleTargetBlur's
    // closure picks up the latest targetInputs) between every change — bundling
    // changeText and blur into one act() batches all of it against the same
    // stale render, so the blur handler still sees the pre-change state.
    await act(async () => {
      fireEvent.changeText(allDashInputs[0], '4');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      fireEvent.changeText(allDashInputs[1], '12');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      fireEvent(allDashInputs[0], 'blur');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      fireEvent(allDashInputs[1], 'blur');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateTemplateExerciseTargets).toHaveBeenCalledWith('te-2', {
      targetSets: 4,
      targetReps: 12,
    });
  });
});
