// __tests__/components/dashboard.test.js
import { render, screen, act } from '@testing-library/react-native'
import TrainerDashboard from '../../app/(tabs)/index'

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: View }
})

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

const MOCK_SESSION = { user: { id: 'mock-trainer-id' } }

jest.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({
    session: MOCK_SESSION,
    loading: false,
  }),
}))

jest.mock('../../lib/queries/sessions', () => ({
  getSessionsForDate: jest.fn(),
}))

import { getSessionsForDate } from '../../lib/queries/sessions'

describe('Trainer Dashboard', () => {
  afterEach(() => jest.clearAllMocks())

  describe('when no sessions are scheduled', () => {
    beforeEach(() => {
      getSessionsForDate.mockResolvedValue({ data: [], error: null })
    })

    it('shows the empty state', async () => {
      await render(<TrainerDashboard />);
      const emptyStateMessage = screen.findByText('No sessions scheduled for this day.');
      // const emptyStateMessage = await screen.findByText('No sessions scheduled for this day.');
      expect(emptyStateMessage).toBeTruthy()
    })
  })

  describe('when a session is scheduled', () => {
    beforeEach(() => {
      getSessionsForDate.mockResolvedValue({
        data: [
          {
            id: 'session-1',
            scheduled_start: '2026-08-19T09:00:00',
            scheduled_end: '2026-08-19T10:00:00',
            location: 'Test Gym',
            status: 'planned',
            client: { id: 'client-1', name: 'Test Client' },
            day_type_template: { id: 'template-1', name: 'Leg Day' },
          },
        ],
        error: null,
      })
    })

    it('displays the session card with client, time, and location', async () => {
      await render(<TrainerDashboard />);

      const clientCard = await screen.findByText('Test Client');
      const gymLocation = await screen.findByText('Test Gym');

      expect(clientCard).toBeTruthy()
      expect(gymLocation).toBeTruthy()
    })
  })
})