// lib/powersync/config.ts

// The PowerSync instance this build syncs with. Not a secret. Empty means
// the app runs without sync.
export const powersyncUrl = process.env.EXPO_PUBLIC_POWERSYNC_URL;
