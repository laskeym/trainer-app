import 'react-native-url-polyfill/auto'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const useLocal = process.env.EXPO_PUBLIC_USE_LOCAL_SUPABASE === 'true'

function getLocalSupabaseUrl() {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:54321' // Android emulator's alias for host localhost
  }
  return 'http://127.0.0.1:54321' // iOS simulator shares the Mac's localhost directly
}

const supabaseUrl = useLocal
  ? getLocalSupabaseUrl()
  : process.env.EXPO_PUBLIC_SUPABASE_URL_REMOTE!
const supabaseAnonKey = useLocal
  ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_LOCAL!
  : process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_REMOTE!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})