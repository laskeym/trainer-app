import 'react-native-url-polyfill/auto'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const useLocal = process.env.EXPO_PUBLIC_USE_LOCAL_SUPABASE === 'true'

// The local stack only exists on a developer's machine (10.0.2.2 /
// 127.0.0.1), so a release bundle pointed at it can never reach a backend.
// EXPO_PUBLIC_* values are inlined when the JS is bundled, which means a
// stray .env with the flag on would silently bake that into a build or an
// OTA update. Fail loudly at startup instead of shipping an app where every
// request just times out.
if (!__DEV__ && useLocal) {
  throw new Error(
    'EXPO_PUBLIC_USE_LOCAL_SUPABASE is "true" in a release build. ' +
      'Release builds must use the remote Supabase project: set ' +
      'EXPO_PUBLIC_USE_LOCAL_SUPABASE="false" and rebuild.'
  )
}

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

// expo-router's web output does a server-side render pass in a plain
// Node.js process before anything ever reaches a real browser — no
// `window`, no `localStorage`. AsyncStorage's web implementation is
// resolved purely by Metro's platform-target file resolution (not a
// runtime check), so it assumes a browser is always present whenever
// targeting web, and touches `window`/`localStorage` directly. Supabase's
// auth client tries to restore a persisted session the instant
// createClient() runs, so passing AsyncStorage through unconditionally
// crashes that Node SSR process immediately with "window is not defined"
// — taking the whole dev server down with it.
//
// React Native's own runtime polyfills `window` as an alias for `global`
// (see InitializeCore), so `window` is defined in true native app
// execution and in a real browser — it's only ever undefined during this
// specific Node SSR pass. There's no real user session to restore
// server-side anyway, so storage is only wired up where it can safely run;
// it's a harmless no-op otherwise.
const isServerRender = typeof window === 'undefined'

const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isServerRender ? noopStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})