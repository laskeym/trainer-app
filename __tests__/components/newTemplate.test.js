import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AddTemplateScreen from '../../app/templates/new';
import { useRouter } from 'expo-router';
import { createDayTypeTemplate } from '../../lib/queries/templates';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    back: jest.fn(),
    replace: jest.fn(),
  })),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-trainer-id' } } }),
    },
  },
}));

jest.mock('../../lib/queries/templates', () => ({
  createDayTypeTemplate: jest.fn(),
}));

describe('Add Template Screen', () => {
  beforeEach(() => {
    createDayTypeTemplate.mockResolvedValue({ data: { id: 'template-1', name: 'Leg Day' }, error: null });
  });

  afterEach(() => jest.clearAllMocks());

  it('displays the name field and submit button', async () => {
    const { findByText, findByPlaceholderText } = await render(<AddTemplateScreen />);

    expect(await findByText('TEMPLATE NAME *')).toBeTruthy();
    expect(await findByPlaceholderText('Leg Day')).toBeTruthy();
    expect(await findByText('Create Template')).toBeTruthy();
  });

  it('blocks submission without a name', async () => {
    const { findByTestId } = await render(<AddTemplateScreen />);

    const submitButton = await findByTestId('new-template-submit');
    fireEvent.press(submitButton);

    expect(createDayTypeTemplate).not.toHaveBeenCalled();
  });

  it('creates the template and navigates straight into its editor', async () => {
    const mockReplace = jest.fn();
    useRouter.mockReturnValue({ back: jest.fn(), replace: mockReplace });

    const { findByPlaceholderText, findByTestId } = await render(<AddTemplateScreen />);

    const nameInput = await findByPlaceholderText('Leg Day');
    fireEvent.changeText(nameInput, 'Push Day');

    const submitButton = await findByTestId('new-template-submit');

    await act(async () => {
      fireEvent.press(submitButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(createDayTypeTemplate).toHaveBeenCalledWith({
      trainerId: 'mock-trainer-id',
      name: 'Push Day',
    });
    // Replace (not push) into the editor — "back" from the editor should
    // return to the template list, not to this now-done create screen.
    expect(mockReplace).toHaveBeenCalledWith('/templates/template-1');
  });
});
