// lib/powersync/db.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from './schema';
import { powersyncUrl } from './config';
import { SupabaseConnector } from './connector';

// The single on-device database for the app. Screens read and write this;
// PowerSync keeps it in step with Supabase in the background.
export const powersync = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'trainer.db' },
});

const connector = new SupabaseConnector();

// Whose data is currently in the local database. One device per trainer is
// the norm, but if a different trainer does sign in, the previous trainer's
// rows (and any writes still queued under their name) must go first.
const LOCAL_DATA_OWNER_KEY = 'powersync_local_data_owner';

export async function connectPowerSync(trainerId: string) {
  if (!powersyncUrl) {
    console.warn('EXPO_PUBLIC_POWERSYNC_URL is not set - PowerSync sync is disabled.');
    return;
  }

  const previousOwner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);
  if (previousOwner && previousOwner !== trainerId) {
    await powersync.disconnectAndClear();
  }
  await AsyncStorage.setItem(LOCAL_DATA_OWNER_KEY, trainerId);

  await powersync.connect(connector);
}

/** Stops syncing and wipes every synced row off the device. */
export async function clearPowerSync() {
  await powersync.disconnectAndClear();
  await AsyncStorage.removeItem(LOCAL_DATA_OWNER_KEY);
}
