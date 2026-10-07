// app/powersync-spike.tsx
//
// Development-only screen for the PowerSync spike. It proves one table
// (client) end to end against the local database, and shows enough of the
// sync state to run the airplane-mode and two-trainer checks by eye. It is
// not part of the product; the real screens move over in later phases.
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePowerSync, useQuery, useStatus } from '@powersync/react';
import { useAuth } from '../lib/AuthContext';
import { powersyncUrl } from '../lib/powersync/config';
import type { ClientRecord } from '../lib/powersync/schema';

const TABLES = [
  'trainer',
  'client',
  'client_metric',
  'exercise',
  'day_type_template',
  'template_exercise',
  'workout_session',
  'session_exercise',
  'set_log',
] as const;

const ROW_COUNTS_SQL = TABLES.map((t) => `SELECT '${t}' AS name, count(*) AS rows FROM ${t}`).join(' UNION ALL ');

// Rows that should never be on this trainer's device: anything owned by
// someone else, or a child row whose parent didn't sync with it. Every
// count here must be 0 — anything else means the sync streams leak.
const ISOLATION_SQL = `
  SELECT 'trainer rows that are not me' AS name, count(*) AS rows FROM trainer WHERE id != ?1
  UNION ALL SELECT 'client owned by someone else', count(*) FROM client WHERE trainer_id != ?1
  UNION ALL SELECT 'template owned by someone else', count(*) FROM day_type_template WHERE trainer_id != ?1
  UNION ALL SELECT 'session owned by someone else', count(*) FROM workout_session WHERE trainer_id != ?1
  UNION ALL SELECT 'custom exercise owned by someone else', count(*) FROM exercise
    WHERE trainer_id IS NOT NULL AND trainer_id != ?1
  UNION ALL SELECT 'client_metric without my client', count(*) FROM client_metric
    WHERE client_id NOT IN (SELECT id FROM client WHERE trainer_id = ?1)
  UNION ALL SELECT 'template_exercise without my template', count(*) FROM template_exercise
    WHERE template_id NOT IN (SELECT id FROM day_type_template WHERE trainer_id = ?1)
  UNION ALL SELECT 'session_exercise without my session', count(*) FROM session_exercise
    WHERE session_id NOT IN (SELECT id FROM workout_session WHERE trainer_id = ?1)
  UNION ALL SELECT 'set_log without my session_exercise', count(*) FROM set_log
    WHERE session_exercise_id NOT IN (
      SELECT session_exercise.id FROM session_exercise
        JOIN workout_session ON workout_session.id = session_exercise.session_id
      WHERE workout_session.trainer_id = ?1
    )
`;

type CountRow = { name: string; rows: number };

export default function PowerSyncSpikeScreen() {
  const db = usePowerSync();
  const status = useStatus();
  const { session } = useAuth();
  const trainerId = session?.user.id ?? '';

  const { data: clients } = useQuery<ClientRecord>(
    'SELECT * FROM client WHERE trainer_id = ? ORDER BY name',
    [trainerId]
  );
  const { data: rowCounts } = useQuery<CountRow>(ROW_COUNTS_SQL);
  const { data: isolation } = useQuery<CountRow>(ISOLATION_SQL, [trainerId]);

  // The upload queue isn't a watchable table, so poll it while this screen is open.
  const [pendingUploads, setPendingUploads] = useState(0);
  useEffect(() => {
    let active = true;
    const read = () =>
      db.getUploadQueueStats().then((stats) => {
        if (active) setPendingUploads(stats.count);
      });
    read();
    const timer = setInterval(read, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [db]);

  const run = (label: string, write: () => Promise<unknown>) => async () => {
    try {
      await write();
    } catch (error: any) {
      Alert.alert(`${label} failed`, error?.message ?? 'Unknown error');
    }
  };

  // uuid() is PowerSync's SQLite function: the id is generated on-device, so
  // the row exists (and can be referenced) before the server has seen it.
  const addClient = run('Add', () =>
    db.execute(
      'INSERT INTO client (id, trainer_id, name, medical_constraints) VALUES (uuid(), ?, ?, ?)',
      [trainerId, `Spike ${new Date().toLocaleTimeString()}`, 'None']
    )
  );
  const renameClient = (id: string) =>
    run('Rename', () =>
      db.execute('UPDATE client SET name = ? WHERE id = ?', [`Renamed ${new Date().toLocaleTimeString()}`, id])
    );
  const deleteClient = (id: string) => run('Delete', () => db.execute('DELETE FROM client WHERE id = ?', [id]));

  const leaked = isolation.reduce((total, row) => total + row.rows, 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Sync status</Text>
      <View style={styles.card}>
        <Row label="Instance URL set" value={powersyncUrl ? 'yes' : 'NO - set EXPO_PUBLIC_POWERSYNC_URL'} />
        <Row label="Connected" value={status.connected ? 'yes' : status.connecting ? 'connecting' : 'no'} />
        <Row label="First sync done" value={status.hasSynced ? 'yes' : 'no'} />
        <Row label="Last synced" value={status.lastSyncedAt?.toLocaleTimeString() ?? '-'} />
        <Row label="Downloading" value={status.dataFlowStatus.downloading ? 'yes' : 'no'} />
        <Row label="Uploading" value={status.dataFlowStatus.uploading ? 'yes' : 'no'} />
        <Row label="Pending uploads" value={String(pendingUploads)} testID="pending-uploads" />
        {status.dataFlowStatus.downloadError && (
          <Text style={styles.error}>Download error: {status.dataFlowStatus.downloadError.message}</Text>
        )}
        {status.dataFlowStatus.uploadError && (
          <Text style={styles.error}>Upload error: {status.dataFlowStatus.uploadError.message}</Text>
        )}
      </View>

      <Text style={styles.heading}>Local rows</Text>
      <View style={styles.card}>
        {rowCounts.map((row) => (
          <Row key={row.name} label={row.name} value={String(row.rows)} />
        ))}
      </View>

      <Text style={styles.heading}>Isolation check (all must be 0)</Text>
      <View style={styles.card}>
        {isolation.map((row) => (
          <Row key={row.name} label={row.name} value={String(row.rows)} bad={row.rows > 0} />
        ))}
        <Text style={leaked > 0 ? styles.error : styles.ok} testID="isolation-result">
          {leaked > 0 ? `LEAK: ${leaked} row(s) that are not this trainer's` : 'No foreign rows on this device'}
        </Text>
      </View>

      <Text style={styles.heading}>Clients (local database)</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={addClient} testID="spike-add-client">
        <Text style={styles.primaryButtonText}>Add client</Text>
      </TouchableOpacity>
      {clients.map((client) => (
        <View key={client.id} style={styles.clientRow}>
          <Text style={styles.clientName} numberOfLines={1}>
            {client.name}
          </Text>
          <TouchableOpacity onPress={renameClient(client.id)}>
            <Text style={styles.link}>Rename</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={deleteClient(client.id)}>
            <Text style={[styles.link, styles.destructive]}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

function Row({ label, value, bad, testID }: { label: string; value: string; bad?: boolean; testID?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bad && styles.destructive]} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, backgroundColor: '#F9F9FB' },
  heading: { fontSize: 11, fontWeight: '700', color: '#8E8E93', letterSpacing: 0.5, marginTop: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 14, color: '#1C1C1E', flexShrink: 1 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  ok: { fontSize: 13, fontWeight: '600', color: '#248A3D', marginTop: 4 },
  error: { fontSize: 13, fontWeight: '600', color: '#D70015', marginTop: 4 },
  primaryButton: { backgroundColor: '#1C1C1E', borderRadius: 12, height: 44, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#FFF', borderRadius: 12, padding: 12 },
  clientName: { flex: 1, fontSize: 15, color: '#1C1C1E' },
  link: { fontSize: 14, fontWeight: '600', color: '#0A84FF' },
  destructive: { color: '#D70015' },
});
