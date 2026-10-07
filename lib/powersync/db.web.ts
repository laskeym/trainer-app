// lib/powersync/db.web.ts
//
// The native SQLite adapter (@op-engineering/op-sqlite) can't be bundled for
// web, so on web there is no local database and nothing to sync or clear.
// Metro picks this file instead of db.ts for web bundles.
export async function connectPowerSync(_trainerId: string) {}

export async function clearPowerSync() {}
