// lib/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearPowerSync } from './powersync/db'

const AuthContext = createContext<{
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<{ error: Error | null }>
}>(null!)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // lib/AuthContext.tsx
useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session) {
      // getUser() actually round-trips to the server, unlike getSession()
      const { error } = await supabase.auth.getUser()
      if (error) {
        await supabase.auth.signOut()
        setSession(null)
        setLoading(false)
        return
      }
    }
    setSession(session)
    setLoading(false)
  })

  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session)
  })

  return () => listener.subscription.unsubscribe()
}, [])

  const signIn = (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password })

  const signUp = (email: string, password: string) =>
    supabase.auth.signUp({ email, password })

  // Synced rows include client names and medical notes, so they come off the
  // device before the session does. A failure to wipe must not trap the
  // trainer in a signed-in state, so it's reported and sign-out carries on.
  const signOut = async () => {
    try {
      await clearPowerSync()
    } catch (error: any) {
      console.error('Failed to clear local data on sign-out:', error?.message)
    }
    return supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)