import { createClient, SupabaseClient, type PostgrestError } from '@supabase/supabase-js';
import {
  SessionState,
  createInitialSession,
  normalizeSession,
} from '@/lib/session';

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

export type RemoteSaveResult = RemoteSession;

type RemoteSaveRpcResult = {
  saved: boolean;
  revision: number;
  state: SessionState;
  updated_at: string;
  closed_at: string | null;
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
