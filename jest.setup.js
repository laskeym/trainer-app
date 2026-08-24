import 'dotenv/config'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock(
  '@react-native-async-storage/async-storage',
  () => mockAsyncStorage
)

// Some component tests trigger a state update (e.g. a screen's own
// setLoading/setClients inside a useFocusEffect fetch) that resolves a tick
// after the test's own assertions and act() scope have already completed —
// timing that's sensitive to the host machine's event-loop/timer behavior,
// so it can show up locally even when the exact same test is clean in CI (or
// vice versa). The tests themselves still pass either way; this only
// silences that specific React warning so it doesn't clutter output. Any
// other console.error still prints normally.
const originalConsoleError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('not configured to support act(...)')
  ) {
    return;
  }
  originalConsoleError(...args);
};