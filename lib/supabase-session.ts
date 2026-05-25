import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SessionState, createInitialSession, normalizeSession } from "@/lib/session";

type SessionRow = {
  id: string;
  state: SessionState;
  updated_at: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

export async function loadRemoteSession(sessionId: string): Promise<SessionState> {
  if (!supabase) {
    return createInitialSession();
  }

  const { data, error } = await supabase
    .from("badminton_sessions")
    .select("state")
    .eq("id", sessionId)
    .maybeSingle<Pick<SessionRow, "state">>();

  if (error) {
    throw error;
  }

  if (!data) {
    const initialSession = createInitialSession();
    await saveRemoteSession(sessionId, initialSession);
    return initialSession;
  }

  return normalizeSession(data.state);
}

export async function saveRemoteSession(sessionId: string, session: SessionState): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("badminton_sessions").upsert({
    id: sessionId,
    state: session,
    updated_at: new Date().toISOString()
  });

  if (error) {
    throw error;
  }
}

export async function loadRemoteNow(): Promise<string> {
  if (!supabase) {
    return new Date().toISOString();
  }

  const { data, error } = await supabase.rpc("current_server_time");
  if (error || typeof data !== "string") {
    return new Date().toISOString();
  }

  return data;
}

export function subscribeRemoteSession(
  sessionId: string,
  onSession: (session: SessionState) => void
) {
  if (!supabase) {
    return () => undefined;
  }

  const channel = supabase
    .channel(`badminton-session-${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "badminton_sessions",
        filter: `id=eq.${sessionId}`
      },
      (payload) => {
        const nextRow = payload.new as SessionRow | null;
        if (nextRow?.state) {
          onSession(normalizeSession(nextRow.state));
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
