// lib/powersync/PowerSyncProvider.tsx
import { useEffect } from 'react';
import { PowerSyncContext } from '@powersync/react-native';
import { useAuth } from '../AuthContext';
import { connectPowerSync, powersync } from './db';

/**
 * Makes the local database available to useQuery/useStatus below it and
 * starts syncing once a trainer is signed in. Must sit inside AuthProvider.
 */
export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const trainerId = session?.user.id;

  useEffect(() => {
    if (!trainerId) return;
    connectPowerSync(trainerId).catch((error) => {
      console.error('PowerSync failed to connect:', error?.message);
    });
  }, [trainerId]);

  return <PowerSyncContext.Provider value={powersync}>{children}</PowerSyncContext.Provider>;
}
