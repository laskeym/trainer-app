// lib/powersync/PowerSyncProvider.web.tsx
//
// Web has no local database (see db.web.ts), so this only passes children
// through. Metro picks this file instead of PowerSyncProvider.tsx on web.
export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
