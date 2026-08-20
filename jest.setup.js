import 'dotenv/config'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock(
  '@react-native-async-storage/async-storage',
  () => mockAsyncStorage
)