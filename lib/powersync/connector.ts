// lib/powersync/connector.ts
import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/react-native';
import { supabase } from '../supabase';
import { powersyncUrl } from './config';

// Postgres/PostgREST error codes retrying will never fix: the row itself is
// what the server objects to.
const FATAL_RESPONSE_CODES = [
  /^22...$/, // data exception (bad type, out of range)
  /^23...$/, // integrity constraint violation (not null, foreign key, unique, check)
  /^42501$/, // insufficient privilege — in practice an RLS rejection
];

/**
 * Spike-level connector: enough to prove the round trip. Downloads are
 * authorised by the trainer's own Supabase JWT (PowerSync validates it and
 * hands it to the sync streams as auth.user_id()); uploads replay each
 * queued local write through supabase-js, so RLS applies to them exactly as
 * it does to a direct call.
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!session || !powersyncUrl) return null;

    return { endpoint: powersyncUrl, token: session.access_token };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let lastOp: CrudEntry | null = null;
    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = supabase.from(op.table);
        let result;
        switch (op.op) {
          case UpdateType.PUT:
            // Upsert on the client-generated id, so replaying a write that
            // already landed (e.g. the response was lost) is a no-op.
            result = await table.upsert({ ...op.opData, id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData ?? {}).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id);
            break;
        }
        if (result?.error) throw result.error;
      }
      await transaction.complete();
    } catch (error: any) {
      // Only the table, operation and error code are logged — never the row,
      // which can carry a client's name or medical notes.
      const where = lastOp ? `${lastOp.op} ${lastOp.table}` : 'transaction';
      if (typeof error?.code === 'string' && FATAL_RESPONSE_CODES.some((re) => re.test(error.code))) {
        console.error(`PowerSync upload rejected (${where}, code ${error.code}) - discarding`);
        await transaction.complete();
        return;
      }
      console.warn(`PowerSync upload failed (${where}, code ${error?.code ?? 'none'}) - will retry`);
      throw error;
    }
  }
}
