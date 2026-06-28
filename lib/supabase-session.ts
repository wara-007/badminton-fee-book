import { createClient, SupabaseClient, type PostgrestError } from '@supabase/supabase-js';
import {
  SessionState,
  createInitialSession,
  normalizeSession,
} from '@/lib/session';
import {
  PaymentAccountId,
  createEmptyReceivedByAccount,
  normalizeReceivedByAccount,
  normalizePaymentAccountId,
} from '@/lib/payment-accounts';

type SessionRow = {
  id: string;
  state: SessionState;
  updated_at: string;
  revision: number;
  closed_at?: string | null;
};

export type RemoteSession = {
  session: SessionState;
  revision: number;
  closedAt: string | null;
};

export type RoomDashboardSnapshot = {
  roomId: string;
  startedAt: string;
  capturedAt: string;
  peopleCount: number;
  customerCount: number;
  shuttleCount: number;
  receivedAmount: number;
  receivedByAccount: Record<PaymentAccountId, number>;
  joinedByHour: Record<string, number>;
  paidByHour: Record<string, number>;
};

export type RemoteSaveResult = RemoteSession;

type RemoteSaveRpcResult = {
  saved: boolean;
  revision: number;
  state: SessionState;
  updated_at: string;
  closed_at: string | null;
};

type RoomDashboardSnapshotRpcResult = {
  room_id: string;
  started_at: string;
  captured_at: string;
  people_count: number;
  customer_count: number;
  shuttle_count: number;
  received_amount: number;
  received_by_account?: unknown;
  joined_by_hour?: unknown;
  paid_by_hour?: unknown;
};

type PaymentSettingsRpcResult = {
  selected_account_id?: string;
};

export class RemoteSaveConflictError extends Error {
  remote: RemoteSaveResult;

  constructor(remote: RemoteSaveResult) {
    super('Remote session changed before this save completed.');
    this.name = 'RemoteSaveConflictError';
    this.remote = remote;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

let remoteNowSupported = true;

export function prepareSessionForRemote(session: SessionState): SessionState {
  return {
    ...session,
    activityLog: session.activityLog.filter(
      (activity) => activity.action === 'mark-added' || activity.action === 'match-confirmed',
    ),
  };
}

function normalizeRemoteRow(row: Pick<SessionRow, 'state' | 'updated_at'>): SessionState {
  const normalized = normalizeSession(row.state);
  const rowUpdatedAt = new Date(row.updated_at).getTime();

  if (Number.isNaN(rowUpdatedAt)) {
    return normalized;
  }

  return {
    ...normalized,
    updatedAt: row.updated_at,
  };
}

export function parseRemoteSaveResult(result: RemoteSaveRpcResult): RemoteSaveResult {
  const remote = {
    session: normalizeRemoteRow(result),
    revision: result.revision,
    closedAt: result.closed_at ?? null,
  };

  if (!result.saved) {
    throw new RemoteSaveConflictError(remote);
  }

  return remote;
}

function normalizeDashboardSnapshot(
  snapshot: RoomDashboardSnapshotRpcResult,
): RoomDashboardSnapshot {
  return {
    roomId: snapshot.room_id,
    startedAt: snapshot.started_at,
    capturedAt: snapshot.captured_at,
    peopleCount: Number(snapshot.people_count) || 0,
    customerCount: Number(snapshot.customer_count) || 0,
    shuttleCount: Number(snapshot.shuttle_count) || 0,
    receivedAmount: Number(snapshot.received_amount) || 0,
    receivedByAccount: normalizeReceivedByAccount(
      snapshot.received_by_account,
      Number(snapshot.received_amount) || 0,
    ),
    joinedByHour: normalizeHourlyCounts(snapshot.joined_by_hour),
    paidByHour: normalizeHourlyCounts(snapshot.paid_by_hour),
  };
}

function normalizeHourlyCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([hour, count]) => [
        hour,
        Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0,
      ])
      .filter(([hour, count]) => /^\d{2}:00$/.test(String(hour)) && Number(count) > 0),
  );
}

function normalizePaymentSettings(
  settings: PaymentSettingsRpcResult | null,
): PaymentAccountId {
  return normalizePaymentAccountId(settings?.selected_account_id);
}

export async function loadRemoteSession(
  sessionId: string,
): Promise<RemoteSession> {
  if (!supabase) {
    return { session: createInitialSession(), revision: 0, closedAt: null };
  }

  const { data, error } = await supabase.rpc('load_normalized_badminton_session', {
    p_id: sessionId,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    const initialSession = createInitialSession();
    return saveRemoteSession(sessionId, initialSession, 0);
  }

  return {
    session: normalizeRemoteRow(data as RemoteSaveRpcResult),
    revision: Number((data as RemoteSaveRpcResult).revision),
    closedAt: (data as RemoteSaveRpcResult).closed_at ?? null,
  };
}

export async function saveRemoteSession(
  sessionId: string,
  session: SessionState,
  expectedRevision = 0,
): Promise<RemoteSaveResult> {
  if (!supabase) {
    return { session, revision: expectedRevision, closedAt: null };
  }

  const { data, error } = await supabase.rpc('save_normalized_badminton_session', {
    p_id: sessionId,
    p_state: prepareSessionForRemote(session),
    p_expected_revision: expectedRevision,
  });

  if (error) {
    throw error;
  }

  return parseRemoteSaveResult(data as RemoteSaveRpcResult);
}

export async function setRemotePlayerPayment(options: {
  sessionId: string;
  playerId: string;
  paid: boolean;
  paidAmount?: number;
  paidAccountId?: PaymentAccountId;
  paidAt?: string;
}): Promise<RemoteSaveResult> {
  if (!supabase) {
    return {
      session: createInitialSession(),
      revision: 0,
      closedAt: null,
    };
  }

  const { data, error } = await supabase.rpc('set_badminton_player_payment', {
    p_room_id: options.sessionId,
    p_player_id: options.playerId,
    p_paid: options.paid,
    p_paid_amount: options.paid ? options.paidAmount ?? 0 : null,
    p_paid_account_id: options.paid
      ? normalizePaymentAccountId(options.paidAccountId)
      : null,
    p_paid_at: options.paid ? options.paidAt ?? new Date().toISOString() : null,
  });

  if (error) {
    throw error;
  }

  return parseRemoteSaveResult(data as RemoteSaveRpcResult);
}

export async function closeRemoteSession(sessionId: string): Promise<string> {
  if (!supabase) {
    return new Date().toISOString();
  }

  const { data, error } = await supabase.rpc('close_normalized_badminton_room', {
    p_room_id: sessionId,
  });
  if (error) {
    throw error;
  }
  return String(data);
}

export async function loadRemoteNow(): Promise<string> {
  if (!supabase || !remoteNowSupported) {
    return new Date().toISOString();
  }

  const { data, error } = await supabase.rpc('current_server_time');
  if (error || typeof data !== 'string') {
    const postgrestError = error as PostgrestError | null;
    if (postgrestError?.code === 'PGRST100' || postgrestError?.message.includes('Not Found')) {
      remoteNowSupported = false;
    }
    return new Date().toISOString();
  }

  return data;
}

export async function listRemoteSessions(): Promise<
  Array<{ id: string; updated_at: string }>
> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('badminton_rooms')
    .select('id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ id: string; updated_at: string }>;
}

export async function deleteRemoteSession(sessionId: string): Promise<void> {
  if (!supabase) {
    return;
  }

  const { data, error } = await supabase.rpc('delete_normalized_badminton_room', {
    p_room_id: sessionId,
  });

  if (error) {
    throw error;
  }

  if (data !== true) {
    throw new Error(`Remote room "${sessionId}" was not found.`);
  }
}

export async function listRoomDashboardSnapshots(): Promise<RoomDashboardSnapshot[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('list_badminton_room_dashboard_snapshots');
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) =>
    normalizeDashboardSnapshot(row as RoomDashboardSnapshotRpcResult),
  );
}

export async function upsertRoomDashboardSnapshot(
  snapshot: RoomDashboardSnapshot,
): Promise<RoomDashboardSnapshot> {
  if (!supabase) {
    return snapshot;
  }

  const { data, error } = await supabase.rpc('upsert_badminton_room_dashboard_snapshot', {
    p_room_id: snapshot.roomId,
    p_started_at: snapshot.startedAt,
    p_people_count: snapshot.peopleCount,
    p_customer_count: snapshot.customerCount,
    p_shuttle_count: snapshot.shuttleCount,
    p_received_amount: snapshot.receivedAmount,
    p_received_by_account: snapshot.receivedByAccount ?? createEmptyReceivedByAccount(),
    p_joined_by_hour: snapshot.joinedByHour ?? {},
    p_paid_by_hour: snapshot.paidByHour ?? {},
  });

  if (error) {
    throw error;
  }

  return normalizeDashboardSnapshot(data as RoomDashboardSnapshotRpcResult);
}

export async function loadPaymentAccountSetting(): Promise<PaymentAccountId> {
  if (!supabase) {
    return normalizePaymentAccountId(null);
  }

  const { data, error } = await supabase.rpc('get_badminton_payment_settings');
  if (error) {
    throw error;
  }

  return normalizePaymentSettings(data as PaymentSettingsRpcResult | null);
}

export async function savePaymentAccountSetting(
  accountId: PaymentAccountId,
): Promise<PaymentAccountId> {
  if (!supabase) {
    return normalizePaymentAccountId(accountId);
  }

  const { data, error } = await supabase.rpc('set_badminton_payment_account', {
    p_selected_account_id: accountId,
  });
  if (error) {
    throw error;
  }

  return normalizePaymentSettings(data as PaymentSettingsRpcResult | null);
}

export function subscribePaymentSettings(
  onPaymentSettings: (accountId: PaymentAccountId) => void,
) {
  if (!supabase) {
    return () => undefined;
  }

  const channel = supabase
    .channel('badminton-payment-settings')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'badminton_payment_settings',
      },
      (payload) => {
        const nextRow = payload.new as { selected_account_id?: string } | null;
        if (nextRow) {
          onPaymentSettings(normalizePaymentAccountId(nextRow.selected_account_id));
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeRemoteSession(
  sessionId: string,
  onSession: (remote: RemoteSession) => void,
) {
  if (!supabase) {
    return () => undefined;
  }

  const channel = supabase
    .channel(`badminton-session-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'badminton_rooms',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        const nextRow = payload.new as SessionRow | null;
        if (nextRow?.id) {
          void loadRemoteSession(sessionId).then(onSession);
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
