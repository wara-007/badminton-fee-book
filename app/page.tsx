"use client";

import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LightModeIcon from "@mui/icons-material/LightMode";
import MicIcon from "@mui/icons-material/Mic";
import RemoveIcon from "@mui/icons-material/Remove";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Container,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Fab,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography
} from "@mui/material";
import { getAppTheme } from "@/lib/theme";
import { useThemeMode } from "@/lib/theme-context";
import { useRouter } from "next/navigation";
import { canAutoSaveRemote, getRemoteRefreshRetryDelay, hasUnsyncedLocalChanges, mergeRemoteChangesAgainstBase } from "@/lib/remote-refresh";
import { getRemoteSessionNotification } from "@/lib/remote-notification";
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Player,
  PlayerSkillLevel,
  PlannedMatch,
  DEFAULT_PLAYER_SKILL_LEVEL,
  PLAYER_SKILL_LEVELS,
  REST_MINUTES,
  SessionState,
  appendActivity,
  calculatePlayerTotal,
  createActivity,
  createInitialSession,
  createPlayer,
  exportSessionSummary,
  findMatchOverlapWarning,
  getPlannedMatchSuggestion,
  getPlayerShuttleCount,
  getPlayerShuttleMarks,
  getPlayerWaitStatus,
  getNextOpenShuttleNumber,
  getPriorityPlayers,
  getShuttleMarkSummary,
  getVisibleShuttleColumns,
  groupMatchesByShuttle,
  groupPaidPlayersByDay,
  normalizeSession,
  renumberPlannedMatches,
  setPlayerShuttleMarks,
  summarizeSession
} from "@/lib/session";
import {
  RemoteSaveConflictError,
  closeRemoteSession,
  hasSupabaseConfig,
  loadPaymentAccountSetting,
  loadRemoteNow,
  loadRemoteSession,
  savePaymentAccountSetting,
  saveRemoteSession,
  setRemotePlayerPayment,
  subscribePaymentSettings,
  subscribeRemoteSession
} from "@/lib/supabase-session";
import packageInfo from "@/package.json";
import {
  VoicePlayer,
  VoicePlayerMatchResult,
  matchSpokenPlayerNames
} from "@/lib/voice-player-match";
import { createPromptPayQrUrlFromPayload } from "@/lib/promptpay";
import {
  DEFAULT_PAYMENT_ACCOUNT_ID,
  PAYMENT_ACCOUNTS,
  PaymentAccountId,
  getPaymentAccount,
  normalizePaymentAccountId
} from "@/lib/payment-accounts";

const bahtFormatter = new Intl.NumberFormat("th-TH");
const appVersion = packageInfo.version;
const AUTH_STORAGE_KEY = "badminton-fee-book.auth";
const PLAYER_SKILL_LABELS: Record<PlayerSkillLevel, string> = {
  bg: "BG",
  n: "N",
  s: "S",
  "p-": "P-",
  p: "P"
};
type UserRole = "admin" | "admin2";
type AuthSession = {
  role: UserRole;
};
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric"
});
const matchTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

type AppDialogOptions = {
  title: string;
  message: string;
  headline?: string;
  details?: Array<{
    label: string;
    value: string;
    tone?: "primary" | "warning" | "error";
  }>;
  note?: string;
  image?: {
    src: string;
    alt: string;
    caption?: string;
  };
  confirmLabel?: string;
  cancelLabel?: string;
  color?: "primary" | "error" | "warning" | "secondary";
};

type AppDialogState = AppDialogOptions & {
  open: boolean;
  mode: "alert" | "confirm";
  resolve?: (value: boolean) => void;
};

type PaymentDialogState = {
  open: boolean;
  playerId: string;
  playerName: string;
  shuttleCount: number;
  calculatedAmount: number;
  amountDraft: string;
  resolve?: (value: { confirmed: boolean; amount: number }) => void;
};

type BatchPaymentItem = {
  playerId: string;
  playerName: string;
  shuttleCount: number;
  calculatedAmount: number;
  amountDraft: string;
};

const loginUsers: Record<UserRole, { label: string; password: string }> = {
  admin: {
    label: "admin",
    password: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin"
  },
  admin2: {
    label: "admin2",
    password: process.env.NEXT_PUBLIC_ADMIN2_PASSWORD || "admin2"
  }
};

function getPlayerInitialGroupLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "#";
  }
  const firstChar = trimmed[0]?.toLocaleUpperCase("th-TH") ?? "#";
  if (/^[A-Za-z]$/.test(firstChar)) {
    return firstChar.toUpperCase();
  }
  const firstThaiConsonant = [...trimmed].find((character) => /^[ก-ฮ]$/.test(character));
  if (firstThaiConsonant) {
    return firstThaiConsonant;
  }
  return "#";
}


export default function HomePage() {
  const router = useRouter();
  const { mode, toggleTheme } = useThemeMode();
  const theme = useMemo(() => getAppTheme(mode), [mode]);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [sessionId, setSessionId] = useState("main");
  const [roomDraft, setRoomDraft] = useState("main");
  const [session, setSession] = useState<SessionState>(() => createInitialSession());
  const [playerName, setPlayerName] = useState("");
  const [playerSkillLevel, setPlayerSkillLevel] = useState<PlayerSkillLevel>(DEFAULT_PLAYER_SKILL_LEVEL);
  const [searchTerm, setSearchTerm] = useState("");
  const [ledgerSearchName, setLedgerSearchName] = useState("");
  const [ledgerSearchShuttle, setLedgerSearchShuttle] = useState("");
  const [matchSearchTerm, setMatchSearchTerm] = useState("");
  const [selectedPlannedMatchId, setSelectedPlannedMatchId] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [playerSortMode, setPlayerSortMode] = useState<"queue" | "alphabetical">("queue");
  const [matchSetupMode, setMatchSetupMode] = useState(false);
  const [addPlayerDialogOpen, setAddPlayerDialogOpen] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [mobileSummaryExpanded, setMobileSummaryExpanded] = useState(false);
  const [editingShuttleNumber, setEditingShuttleNumber] = useState<number | null>(null);
  const [editingReturnShuttleNumber, setEditingReturnShuttleNumber] = useState<number | null>(null);
  const [ledgerSelectedPlayerId, setLedgerSelectedPlayerId] = useState<string | null>(null);
  const [batchPaymentMode, setBatchPaymentMode] = useState(false);
  const [batchSelectedPlayerIds, setBatchSelectedPlayerIds] = useState<string[]>([]);
  const [batchPaymentItems, setBatchPaymentItems] = useState<BatchPaymentItem[]>([]);
  const [batchPaymentDialogOpen, setBatchPaymentDialogOpen] = useState(false);
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] =
    useState<PaymentAccountId>(DEFAULT_PAYMENT_ACCOUNT_ID);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(hasSupabaseConfig ? "กำลังเชื่อมต่อ" : "โหมดเครื่องนี้");
  const [refreshingRemote, setRefreshingRemote] = useState(false);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [pendingSyncSnapshot, setPendingSyncSnapshot] = useState<string | null>(null);
  const [lastLocalSavedAt, setLastLocalSavedAt] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [remoteNotification, setRemoteNotification] = useState<string | null>(null);
  const [dialog, setDialog] = useState<AppDialogState>({
    open: false,
    mode: "alert",
    title: "",
    message: ""
  });
  const [paymentDialog, setPaymentDialog] = useState<PaymentDialogState>({
    open: false,
    playerId: "",
    playerName: "",
    shuttleCount: 0,
    calculatedAmount: 0,
    amountDraft: ""
  });
  const lastRemoteSnapshotRef = useRef("");
  const remoteRevisionRef = useRef(0);
  const remoteBaselineReadyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockOffsetRef = useRef(0);
  const sessionRef = useRef(session);
  const addPlayerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return undefined;
    }

    let cancelled = false;

    async function loadPaymentAccount() {
      try {
        const remoteAccountId = await loadPaymentAccountSetting();
        if (cancelled) return;
        setSelectedPaymentAccountId(remoteAccountId);
      } catch (error) {
        console.warn("Failed to load payment account setting", error);
      }
    }

    void loadPaymentAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return undefined;
    }

    return subscribePaymentSettings((accountId) => {
      setSelectedPaymentAccountId(accountId);
    });
  }, []);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateStandaloneMode = () => {
      const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setIsStandalonePwa(displayMode.matches || iosStandalone);
    };
    updateStandaloneMode();
    displayMode.addEventListener("change", updateStandaloneMode);
    return () => displayMode.removeEventListener("change", updateStandaloneMode);
  }, []);

  const refreshFromRemote = useCallback(async () => {
    if (!hasSupabaseConfig || !hydrated || refreshingRemote || document.visibilityState === "hidden") {
      return false;
    }
    const currentSnapshot = serializeSession(normalizeSession(sessionRef.current));
    if (hasUnsyncedLocalChanges({
      currentSnapshot,
      lastRemoteSnapshot: lastRemoteSnapshotRef.current,
      hasPendingSnapshot: Boolean(localStorage.getItem(getPendingSyncKey(sessionId))),
      hasScheduledSave: Boolean(saveTimerRef.current)
    })) {
      return true;
    }
    setRefreshingRemote(true);
    setSyncStatus("กำลังโหลดข้อมูลล่าสุด");
    try {
      const remote = await loadRemoteSession(sessionId);
      const normalizedRemoteSession = normalizeSession(remote.session);
      const snapshot = serializeSession(normalizedRemoteSession);
      remoteRevisionRef.current = remote.revision;
      remoteBaselineReadyRef.current = true;
      setClosedAt(remote.closedAt);
      lastRemoteSnapshotRef.current = snapshot;
      setRemoteNotification(getRemoteSessionNotification(sessionRef.current, normalizedRemoteSession));
      setSession(normalizedRemoteSession);
      setLastSyncedAt(new Date().toISOString());
      setSyncStatus(
        localStorage.getItem(getPendingSyncKey(sessionId))
          ? "ข้อมูลชนกัน กรุณาตรวจสอบ"
          : "ซิงก์แล้ว"
      );
      return true;
    } catch {
      setSyncStatus("ใช้ข้อมูลเครื่องนี้");
      return false;
    } finally {
      setRefreshingRemote(false);
    }
  }, [hydrated, refreshingRemote, sessionId]);

  useEffect(() => {
    if (!addPlayerDialogOpen) {
      return;
    }

    window.setTimeout(() => {
      addPlayerInputRef.current?.focus();
    }, 0);
  }, [addPlayerDialogOpen]);

  useEffect(() => {
    const initialSessionId = getInitialSessionId();
    setSessionId(initialSessionId);
    setRoomDraft(initialSessionId);
    setRoomReady(true);
  }, []);

  useEffect(() => {
    setAuthSession(loadAuthSession());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshClock() {
      const localNow = new Date();
      if (!hasSupabaseConfig) {
        clockOffsetRef.current = 0;
        setClockOffsetMs(0);
        setNow(localNow.toISOString());
        return;
      }

      const remoteNow = await loadRemoteNow();
      if (cancelled) {
        return;
      }
      const remoteTime = new Date(remoteNow).getTime();
      if (Number.isNaN(remoteTime)) {
        clockOffsetRef.current = 0;
        setClockOffsetMs(0);
        setNow(localNow.toISOString());
        return;
      }
      clockOffsetRef.current = remoteTime - Date.now();
      setClockOffsetMs(clockOffsetRef.current);
      setNow(remoteNow);
    }

    void refreshClock();
    const timer = window.setInterval(() => {
      const trustedNow = new Date(Date.now() + clockOffsetRef.current).toISOString();
      setNow(trustedNow);
      void refreshClock();
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!roomReady) {
      return;
    }

    let cancelled = false;
    setHydrated(false);
    remoteBaselineReadyRef.current = false;
    lastRemoteSnapshotRef.current = "";
    remoteRevisionRef.current = 0;

    async function loadSession() {
      if (hasSupabaseConfig) {
        setSyncStatus("กำลังเชื่อมต่อ");
        try {
          const remote = await loadRemoteSession(sessionId);
          if (cancelled) {
            return;
          }
          remoteRevisionRef.current = remote.revision;
          setClosedAt(remote.closedAt);
          const remoteSession = remote.session;
          const normalizedRemoteSession = normalizeSession(remoteSession);
          const remoteSnapshot = serializeSession(normalizedRemoteSession);
          const pendingSnapshot = localStorage.getItem(getPendingSyncKey(sessionId));
          lastRemoteSnapshotRef.current = remoteSnapshot;
          remoteBaselineReadyRef.current = true;
          setSession(normalizedRemoteSession);
          setLastLocalSavedAt(new Date().toISOString());
          if (pendingSnapshot) {
            setPendingSyncSnapshot(pendingSnapshot);
            setSyncStatus("ข้อมูลชนกัน กรุณาตรวจสอบ");
          } else {
            setPendingSyncSnapshot(null);
            setSyncStatus("ซิงก์แล้ว");
            setLastSyncedAt(new Date().toISOString());
          }
        } catch {
          if (cancelled) {
            return;
          }
          const pendingSnapshot = localStorage.getItem(getPendingSyncKey(sessionId));
          if (pendingSnapshot) {
            setSession(parseSessionSnapshot(pendingSnapshot, createInitialSession()));
            remoteBaselineReadyRef.current = true;
          }
          setPendingSyncSnapshot(pendingSnapshot);
          setLastLocalSavedAt(new Date().toISOString());
          setSyncStatus("ใช้ข้อมูลเครื่องนี้");
        }
      } else {
        setSession(loadLocalSession(sessionId));
        remoteBaselineReadyRef.current = true;
        setPendingSyncSnapshot(null);
        setLastLocalSavedAt(new Date().toISOString());
        setSyncStatus("โหมดเครื่องนี้");
      }
      if (!cancelled) {
        setHydrated(true);
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [roomReady, sessionId]);

  useEffect(() => {
    if (!hasSupabaseConfig || !hydrated) {
      return undefined;
    }

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshWithRetry = async (attempt = 0) => {
      const refreshed = await refreshFromRemote();
      if (!refreshed) {
        const retryDelay = getRemoteRefreshRetryDelay(attempt + 1);
        if (!retryTimer && navigator.onLine && retryDelay !== null) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void refreshWithRetry(attempt + 1);
          }, retryDelay);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshWithRetry(0);
      }
    };

    const handleRefreshTrigger = () => void refreshWithRetry(0);
    window.addEventListener("focus", handleRefreshTrigger);
    window.addEventListener("online", handleRefreshTrigger);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleRefreshTrigger);
      window.removeEventListener("online", handleRefreshTrigger);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [hydrated, refreshFromRemote, sessionId]);

  useEffect(() => {
    if (!hasSupabaseConfig || !hydrated) {
      return undefined;
    }

    return subscribeRemoteSession(sessionId, (remote) => {
      setClosedAt(remote.closedAt);
      const remoteSession = remote.session;
      const normalizedRemoteSession = normalizeSession(remoteSession);
      const snapshot = serializeSession(normalizedRemoteSession);
      if (snapshot === lastRemoteSnapshotRef.current) {
        return;
      }
      const currentSnapshot = serializeSession(normalizeSession(sessionRef.current));
      if (snapshot === currentSnapshot) {
        remoteRevisionRef.current = remote.revision;
        remoteBaselineReadyRef.current = true;
        lastRemoteSnapshotRef.current = snapshot;
        localStorage.removeItem(getPendingSyncKey(sessionId));
        setPendingSyncSnapshot(null);
        setSyncStatus("ซิงก์แล้ว");
        setLastSyncedAt(new Date().toISOString());
        return;
      }
      if (hasUnsyncedLocalChanges({
        currentSnapshot,
        lastRemoteSnapshot: lastRemoteSnapshotRef.current,
        hasPendingSnapshot: Boolean(localStorage.getItem(getPendingSyncKey(sessionId))),
        hasScheduledSave: Boolean(saveTimerRef.current)
      })) {
        const notification = getRemoteSessionNotification(sessionRef.current, normalizedRemoteSession);
        const mergedSession = lastRemoteSnapshotRef.current
          ? mergeRemoteChangesAgainstBase(
            parseSessionSnapshot(lastRemoteSnapshotRef.current, sessionRef.current),
            sessionRef.current,
            normalizedRemoteSession
          )
          : null;
        if (mergedSession) {
          remoteRevisionRef.current = remote.revision;
          remoteBaselineReadyRef.current = true;
          lastRemoteSnapshotRef.current = snapshot;
          setRemoteNotification(notification);
          setSession(mergedSession);
          setSyncStatus("กำลังบันทึก");
          return;
        }
        setSyncStatus("ข้อมูลชนกัน กรุณาตรวจสอบ");
        return;
      }
      remoteRevisionRef.current = remote.revision;
      remoteBaselineReadyRef.current = true;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      lastRemoteSnapshotRef.current = snapshot;
      setRemoteNotification(getRemoteSessionNotification(sessionRef.current, normalizedRemoteSession));
      setSession(normalizedRemoteSession);
      if (!localStorage.getItem(getPendingSyncKey(sessionId))) {
        setPendingSyncSnapshot(null);
      }
      setLastLocalSavedAt(new Date().toISOString());
      setSyncStatus("ซิงก์แล้ว");
      setLastSyncedAt(new Date().toISOString());
    });
  }, [hydrated, sessionId]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const normalizedSession = normalizeSession(session);
    const snapshot = serializeSession(normalizedSession);
    setLastLocalSavedAt(new Date().toISOString());

    if (!canAutoSaveRemote({
      hasSupabaseConfig,
      remoteBaselineReady: remoteBaselineReadyRef.current,
      currentSnapshot: snapshot,
      lastRemoteSnapshot: lastRemoteSnapshotRef.current
    })) {
      if (hasSupabaseConfig && snapshot !== lastRemoteSnapshotRef.current) {
        setSyncStatus("ใช้ข้อมูลเครื่องนี้");
      }
      return;
    }

    const currentDraftSummary = getShuttleMarkSummary(
      normalizedSession.players,
      normalizedSession.currentShuttleNumber
    );
    if (currentDraftSummary.count > 0 && !currentDraftSummary.isComplete) {
      setSyncStatus(`รอยืนยันลูก ${normalizedSession.currentShuttleNumber}`);
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setSyncStatus("กำลังบันทึก");
    saveTimerRef.current = setTimeout(() => {
      const lastRemoteSession = lastRemoteSnapshotRef.current
        ? parseSessionSnapshot(lastRemoteSnapshotRef.current, normalizedSession)
        : null;
      if (lastRemoteSession && !isSessionNewerThan(normalizedSession, lastRemoteSession)) {
        setSession(lastRemoteSession);
        localStorage.removeItem(getPendingSyncKey(sessionId));
        setPendingSyncSnapshot(null);
        setSyncStatus("ซิงก์แล้ว");
        return;
      }
      saveRemoteSession(sessionId, normalizedSession, remoteRevisionRef.current)
        .then((remote) => {
          const remoteSnapshot = serializeSession(remote.session);
          remoteRevisionRef.current = remote.revision;
          remoteBaselineReadyRef.current = true;
          setClosedAt(remote.closedAt);
          lastRemoteSnapshotRef.current = remoteSnapshot;
          setSession(remote.session);
          localStorage.removeItem(getPendingSyncKey(sessionId));
          setPendingSyncSnapshot(null);
          setSyncStatus("ซิงก์แล้ว");
          setLastSyncedAt(new Date().toISOString());
        })
        .catch((error: unknown) => {
          if (error instanceof RemoteSaveConflictError) {
            const remoteSession = normalizeSession(error.remote.session);
            const remoteSnapshot = serializeSession(remoteSession);
            const lastRemoteSession = lastRemoteSnapshotRef.current
              ? parseSessionSnapshot(lastRemoteSnapshotRef.current, normalizedSession)
              : null;
            const mergedSession = lastRemoteSession
              ? mergeRemoteChangesAgainstBase(lastRemoteSession, normalizedSession, remoteSession)
              : null;
            const nextSession =
              mergedSession ??
              (!isSessionNewerThan(normalizedSession, remoteSession) ? remoteSession : null);
            remoteRevisionRef.current = error.remote.revision;
            remoteBaselineReadyRef.current = true;
            setClosedAt(error.remote.closedAt);
            lastRemoteSnapshotRef.current = remoteSnapshot;
            if (nextSession) {
              setSession(nextSession);
              localStorage.removeItem(getPendingSyncKey(sessionId));
              setPendingSyncSnapshot(null);
              setSyncStatus(mergedSession ? "กำลังบันทึก" : "ซิงก์แล้ว");
              setLastSyncedAt(new Date().toISOString());
              return;
            }
          }
          localStorage.setItem(getPendingSyncKey(sessionId), snapshot);
          setPendingSyncSnapshot(snapshot);
          setSyncStatus(
            error instanceof RemoteSaveConflictError
              ? "ข้อมูลชนกัน กรุณาตรวจสอบ"
              : "รอส่งขึ้นเซิร์ฟเวอร์"
          );
        });
    }, 250);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [hydrated, session, sessionId]);

  const summary = useMemo(
    () => summarizeSession(session.players, session.pricing),
    [session.players, session.pricing]
  );
  const activeShuttleNumber = editingShuttleNumber ?? session.currentShuttleNumber;
  const currentShuttleSummary = useMemo(
    () =>
      getShuttleMarkSummary(
        session.players,
        activeShuttleNumber
      ),
    [activeShuttleNumber, session.players]
  );
  const targetShuttleSummary = useMemo(
    () =>
      getShuttleMarkSummary(
        session.players,
        session.currentShuttleNumber
      ),
    [session.currentShuttleNumber, session.players]
  );
  const noteShuttleSummary = useMemo(
    () =>
      getShuttleMarkSummary(
        session.players,
        activeShuttleNumber
      ),
    [activeShuttleNumber, session.players]
  );
  const userRole = authSession?.role ?? null;
  const canManageSession = userRole === "admin" && !closedAt;
  const canSetPaid = (userRole === "admin" || userRole === "admin2") && !closedAt;
  const isEditingMode = editingShuttleNumber !== null;
  const isEditingLocked = isEditingMode && !currentShuttleSummary.isComplete;
  const isEmergencySyncStatus =
    syncStatus === "ใช้ข้อมูลเครื่องนี้" ||
    syncStatus === "รอส่งขึ้นเซิร์ฟเวอร์" ||
    syncStatus === "ซิงก์ไม่สำเร็จ" ||
    syncStatus === "ข้อมูลชนกัน กรุณาตรวจสอบ";
  const activePlayers = useMemo(
    () => session.players.filter((player) => !player.paid),
    [session.players]
  );
  const orderedActivePlayers = useMemo(() => {
    if (playerSortMode === "alphabetical") {
      return [...activePlayers].sort((first, second) =>
        first.name.localeCompare(second.name, "th-TH", { sensitivity: "base" })
      );
    }
    return activePlayers;
  }, [activePlayers, playerSortMode]);
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("th-TH");
  const visibleActivePlayers = useMemo(() => {
    if (!normalizedSearch) {
      return orderedActivePlayers;
    }
    return orderedActivePlayers.filter((player) =>
      player.name.toLocaleLowerCase("th-TH").includes(normalizedSearch)
    );
  }, [normalizedSearch, orderedActivePlayers]);
  const normalizedLedgerSearchName = ledgerSearchName.trim().toLocaleLowerCase("th-TH");
  const ledgerSearchShuttleNumber = Number(ledgerSearchShuttle);
  const searchedLedgerShuttleNumber =
    Number.isInteger(ledgerSearchShuttleNumber) && ledgerSearchShuttleNumber > 0
      ? ledgerSearchShuttleNumber
      : null;
  const visibleLedgerPlayers = useMemo(() => {
    return activePlayers.filter((player) =>
      (!normalizedLedgerSearchName ||
        player.name.toLocaleLowerCase("th-TH").includes(normalizedLedgerSearchName)) &&
      (searchedLedgerShuttleNumber === null ||
        getPlayerShuttleMarks(player).includes(searchedLedgerShuttleNumber))
    );
  }, [activePlayers, normalizedLedgerSearchName, searchedLedgerShuttleNumber]);
  const batchSelectedPlayers = useMemo(
    () => activePlayers.filter((player) => batchSelectedPlayerIds.includes(player.id)),
    [activePlayers, batchSelectedPlayerIds]
  );
  const batchSelectedTotal = batchSelectedPlayers.reduce(
    (sum, player) => sum + calculatePlayerTotal(player, session.pricing),
    0
  );
  const paidGroups = useMemo(
    () => groupPaidPlayersByDay(session.players, session.pricing),
    [session.players, session.pricing]
  );
  const matchGroups = useMemo(() => groupMatchesByShuttle(session.players, session.activityLog), [session.players, session.activityLog]);
  const overLimitShuttleNumbers = useMemo(
    () =>
      new Set(
        matchGroups.filter((group) => group.isOverLimit).map((group) => group.shuttleNumber)
      ),
    [matchGroups]
  );
  const incompleteShuttleNumbers = useMemo(
    () =>
      new Set(
        matchGroups.filter((group) => group.isIncomplete).map((group) => group.shuttleNumber)
      ),
    [matchGroups]
  );
  const shuttleSourceMap = useMemo(() => {
    return new Map(matchGroups.map((group) => [group.shuttleNumber, group.source]));
  }, [matchGroups]);
  const visiblePaidGroups = useMemo(() => {
    if (!normalizedSearch) {
      return paidGroups;
    }

    return paidGroups
      .map((group) => ({
        ...group,
        players: group.players.filter((player) =>
          player.name.toLocaleLowerCase("th-TH").includes(normalizedSearch)
        )
      }))
      .filter((group) => group.players.length > 0)
      .map((group) => ({
        ...group,
        totalAmount: group.players.reduce((sum, player) => sum + player.amount, 0)
      }));
  }, [paidGroups, normalizedSearch]);
  const priorityPlayers = useMemo(
    () => getPriorityPlayers(activePlayers, now),
    [activePlayers, now]
  );
  const selectedPlannedMatch =
    session.plannedMatches.find((match) => match.id === selectedPlannedMatchId);
  const plannedPlayerIds = useMemo(
    () => new Set(session.plannedMatches.flatMap((match) => match.playerIds)),
    [session.plannedMatches]
  );
  const shuttleColumns = useMemo(() => {
    if (searchedLedgerShuttleNumber !== null) {
      const matchingColumns = new Set<number>();
      visibleLedgerPlayers.forEach((player) => {
        getPlayerShuttleMarks(player).forEach((mark, markIndex) => {
          if (mark === searchedLedgerShuttleNumber) {
            matchingColumns.add(markIndex);
          }
        });
      });

      return Array.from(matchingColumns).sort((first, second) => first - second);
    }

    return Array.from(
      {
        length: getVisibleShuttleColumns(activePlayers)
      },
      (_, index) => index
    );
  }, [activePlayers, searchedLedgerShuttleNumber, visibleLedgerPlayers]);

  function updateSession(updater: (current: SessionState) => SessionState) {
    setSession((current) => ({
      ...updater(current),
      updatedAt: getTrustedNowIso()
    }));
  }

  function applyRemoteSession(remote: {
    session: SessionState;
    revision: number;
    closedAt: string | null;
  }) {
    const normalizedRemoteSession = normalizeSession(remote.session);
    const remoteSnapshot = serializeSession(normalizedRemoteSession);
    remoteRevisionRef.current = remote.revision;
    remoteBaselineReadyRef.current = true;
    lastRemoteSnapshotRef.current = remoteSnapshot;
    setClosedAt(remote.closedAt);
    setSession(normalizedRemoteSession);
    localStorage.removeItem(getPendingSyncKey(sessionId));
    setPendingSyncSnapshot(null);
    setSyncStatus("ซิงก์แล้ว");
    setLastSyncedAt(new Date().toISOString());
    setLastLocalSavedAt(new Date().toISOString());
  }

  function getTrustedNowIso(): string {
    return new Date(Date.now() + clockOffsetMs).toISOString();
  }

  function showDialog(options: AppDialogOptions, mode: "alert" | "confirm") {
    return new Promise<boolean>((resolve) => {
      setDialog({
        ...options,
        open: true,
        mode,
        resolve
      });
    });
  }

  function toggleMatchSetupMode() {
    setMatchSetupMode((enabled) => {
      const nextEnabled = !enabled;
      if (nextEnabled) {
        setActiveTab(1);
        setSettingsExpanded(false);
      }
      return nextEnabled;
    });
  }

  function showAlert(options: AppDialogOptions) {
    return showDialog(options, "alert");
  }

  function showConfirm(options: AppDialogOptions) {
    return showDialog(options, "confirm");
  }

  function closeDialog(result: boolean) {
    const resolver = dialog.resolve;
    setDialog((current) => ({
      ...current,
      open: false,
      resolve: undefined
    }));
    resolver?.(result);
  }

  function parsePaymentAmount(value: string) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }

  function showPaymentConfirm(player: Player, calculatedAmount: number) {
    return new Promise<{ confirmed: boolean; amount: number }>((resolve) => {
      setPaymentDialog({
        open: true,
        playerId: player.id,
        playerName: player.name,
        shuttleCount: getPlayerShuttleCount(player),
        calculatedAmount,
        amountDraft: String(calculatedAmount),
        resolve
      });
    });
  }

  function closePaymentDialog(confirmed: boolean) {
    const resolver = paymentDialog.resolve;
    const amount = parsePaymentAmount(paymentDialog.amountDraft);
    setPaymentDialog((current) => ({
      ...current,
      open: false,
      resolve: undefined
    }));
    resolver?.({ confirmed: confirmed && amount > 0, amount });
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = loginName.trim().toLocaleLowerCase("th-TH") as UserRole;
    const normalizedPassword = loginPassword.trim();
    const userConfig = loginUsers[normalizedName];
    if (!userConfig || normalizedPassword !== userConfig.password.trim()) {
      setLoginError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      return;
    }

    const nextAuthSession = { role: normalizedName };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuthSession));
    setLoginName("");
    setLoginPassword("");
    setLoginError("");
    router.push("/rooms");
  }

  function logout() {
    setAuthSession(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    router.push("/");
  }

  async function addPlayerFromDraft() {
    if (isEditingLocked || !canManageSession) {
      return false;
    }

    const trimmedName = playerName.trim();
    if (!trimmedName) {
      return false;
    }

    const duplicatedPlayer = session.players.find(
      (player) => player.name.trim().toLocaleLowerCase("th-TH") === trimmedName.toLocaleLowerCase("th-TH")
    );
    if (duplicatedPlayer) {
      const shouldReturnToAddPlayerDialog = addPlayerDialogOpen;
      setAddPlayerDialogOpen(false);
      await showAlert({
        title: "ชื่อซ้ำ",
        headline: `มีชื่อ ${duplicatedPlayer.name} อยู่แล้ว`,
        message: "เพิ่มชื่อซ้ำไม่ได้ เพื่อกันการคิดเงินผิดคน",
        details: [{ label: "ชื่อที่ซ้ำ", value: duplicatedPlayer.name, tone: "warning" }],
        confirmLabel: "รับทราบ",
        color: "warning"
      });
      if (shouldReturnToAddPlayerDialog) {
        setAddPlayerDialogOpen(true);
      }
      return false;
    }

    const createdAt = getTrustedNowIso();
    updateSession((current) => ({
      ...current,
      players: [
        ...current.players,
        {
          ...createPlayer(trimmedName),
          skillLevel: playerSkillLevel,
          joinedAt: createdAt,
          waitingSince: createdAt
        }
      ]
    }));
    setPlayerName("");
    setPlayerSkillLevel(DEFAULT_PLAYER_SKILL_LEVEL);
    if (!matchSetupMode) {
      setActiveTab(0);
    }
    return true;
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await addPlayerFromDraft();
  }

  async function addPlayerFromDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const added = await addPlayerFromDraft();
    if (added) {
      setAddPlayerDialogOpen(false);
    }
  }

  function closeAddPlayerDialog() {
    setAddPlayerDialogOpen(false);
    setPlayerName("");
    setPlayerSkillLevel(DEFAULT_PLAYER_SKILL_LEVEL);
  }

  function updatePlayer(id: string, updater: (player: Player) => Player) {
    updateSession((current) => ({
      ...current,
      players: current.players.map((player) => (player.id === id ? updater(player) : player))
    }));
  }

  async function removePlayer(id: string) {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    const player = session.players.find((currentPlayer) => currentPlayer.id === id);
    if (!player) {
      return;
    }
    const confirmed = await showConfirm({
      title: "ลบผู้เล่น",
      headline: `ลบ ${player.name} ใช่ไหม?`,
      message: "ข้อมูลลูกและสถานะจ่ายของคนนี้จะถูกเอาออกจากรอบนี้",
      details: [{ label: "ผู้เล่น", value: player.name, tone: "error" }],
      confirmLabel: "ลบ",
      color: "error"
    });
    if (!confirmed) {
      return;
    }

    updateSession((current) =>
      appendActivity(
        {
          ...current,
          players: current.players.filter((player) => player.id !== id),
          plannedMatches: current.plannedMatches.map((match) => ({
            ...match,
            playerIds: match.playerIds.filter((playerId) => playerId !== id)
          }))
        },
        createActivity("player-removed", `ลบ ${player.name} ออกจากรอบ`, getTrustedNowIso())
      )
    );
  }

  async function resetSession() {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    if (await showConfirm({
      title: "รีเซ็ตรอบ",
      headline: "ล้างข้อมูลรอบนี้ทั้งหมด",
      message: "รายชื่อ ลูกที่ติ๊ก สถานะจ่าย และประวัติในรอบนี้จะถูกล้าง",
      note: "เหมาะสำหรับเริ่มรอบใหม่เท่านั้น",
      confirmLabel: "รีเซ็ต",
      color: "error"
    })) {
      setEditingShuttleNumber(null);
      setEditingReturnShuttleNumber(null);
      updateSession(() => createInitialSession());
      setActiveTab(0);
    }
  }

  async function clearPlayData() {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    if (await showConfirm({
      title: "ล้างข้อมูลเล่น",
      headline: "ล้างข้อมูลเล่น แต่เก็บรายชื่อไว้",
      message: "ลูกที่ติ๊ก สถานะจ่าย และประวัติล่าสุดจะถูกล้าง แต่รายชื่อผู้เล่นยังอยู่",
      note: "ใช้ตอนอยากทดสอบใหม่โดยไม่ต้องพิมพ์ชื่อซ้ำ",
      confirmLabel: "ล้างข้อมูล",
      color: "warning"
    })) {
      setEditingShuttleNumber(null);
      setEditingReturnShuttleNumber(null);
      updateSession((current) => ({
        ...current,
        currentShuttleNumber: 1,
        plannedMatches: current.plannedMatches.map((match) => ({
          ...match,
          playerIds: []
        })),
        activityLog: [],
        players: current.players.map((player) => ({
          ...player,
          shuttleCount: 0,
          shuttleMarks: [],
          paid: false,
          paidAt: undefined,
          paidAmount: undefined,
          paidAccountId: undefined,
          gameCount: 0
        }))
      }));
      setActiveTab(0);
    }
  }

  function switchSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEditingLocked || !canManageSession) {
      return;
    }

    const nextSessionId = normalizeSessionId(roomDraft);
    setRoomDraft(nextSessionId);
    setSessionId(nextSessionId);
    persistSessionId(nextSessionId);
  }

  function updatePricing(key: "baseFee" | "shuttleFee", value: string) {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    const numericValue = Math.max(0, Number(value) || 0);
    updateSession((current) => ({
      ...current,
      pricing: {
        ...current.pricing,
        [key]: numericValue
      }
    }));
  }

  function updateCurrentShuttleNumber(value: string) {
    if (editingShuttleNumber !== null || !canManageSession) {
      return;
    }

    const requestedValue = value === "" ? 1 : Math.max(1, Number(value) || 1);
    setEditingShuttleNumber(null);
    setEditingReturnShuttleNumber(null);
    updateSession((current) => ({
      ...current,
      currentShuttleNumber: Math.min(
        requestedValue,
        getNextOpenShuttleNumber(current.players)
      )
    }));
  }

  function stepCurrentShuttleNumber(step: number) {
    if (editingShuttleNumber !== null || !canManageSession) {
      return;
    }

    setEditingShuttleNumber(null);
    setEditingReturnShuttleNumber(null);
    updateSession((current) => ({
      ...current,
      currentShuttleNumber: Math.min(
        Math.max(1, current.currentShuttleNumber + step),
        getNextOpenShuttleNumber(current.players)
      )
    }));
  }

  function addActiveShuttlePlayer(playerId: string) {
    const targetPlayer = session.players.find((player) => player.id === playerId);
    if (!targetPlayer) {
      return;
    }

    toggleShuttleMark(playerId, getPlayerShuttleCount(targetPlayer));
  }

  function removeActiveShuttlePlayer(playerId: string) {
    if (!canManageSession) {
      return;
    }

    const player = session.players.find((currentPlayer) => currentPlayer.id === playerId);
    if (!player) {
      return;
    }

    const currentMarks = getPlayerShuttleMarks(player);
    const activeShuttleNumber = editingShuttleNumber ?? session.currentShuttleNumber;
    const columnIndex = currentMarks.findIndex((mark) => mark === activeShuttleNumber);

    if (columnIndex === -1) {
      return;
    }

    const targetShuttleNumber = activeShuttleNumber;
    const isEditingFlow = editingShuttleNumber !== null || targetShuttleNumber !== session.currentShuttleNumber;
    const returnShuttleNumber = editingReturnShuttleNumber ?? session.currentShuttleNumber;

    const nextPlayers = session.players.map((currentPlayer) =>
      currentPlayer.id === playerId
        ? setPlayerShuttleMarks(
          currentPlayer,
          getPlayerShuttleMarks(currentPlayer).filter((_, markIndex) => markIndex !== columnIndex)
        )
        : currentPlayer
    );

    const targetShuttleSummary = getShuttleMarkSummary(nextPlayers, targetShuttleNumber);
    const shouldKeepEditingShuttle =
      targetShuttleSummary.count > 0 &&
      !targetShuttleSummary.isComplete &&
      (editingShuttleNumber !== null);
    setEditingShuttleNumber(shouldKeepEditingShuttle ? targetShuttleNumber : null);
    setEditingReturnShuttleNumber(shouldKeepEditingShuttle ? returnShuttleNumber : null);

    updateSession((current) => {
      const nextOpenShuttleNumber = getNextOpenShuttleNumber(nextPlayers);
      let nextSession: SessionState = {
        ...current,
        players: nextPlayers,
        plannedMatches: current.plannedMatches.map((match) => ({
          ...match,
          playerIds: match.playerIds.filter((currentPlayerId) => currentPlayerId !== playerId)
        })),
        currentShuttleNumber: Math.min(current.currentShuttleNumber, nextOpenShuttleNumber)
      };
      nextSession = appendActivity(
        nextSession,
        createActivity(
          "mark-removed",
          `เอา ${player.name} ออกจากลูก ${targetShuttleNumber}`,
          getTrustedNowIso()
        )
      );
      return nextSession;
    });
  }

  async function addPlayerToPlannedMatch(playerId: string) {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    const targetMatch = selectedPlannedMatch;
    const player = activePlayers.find((currentPlayer) => currentPlayer.id === playerId);
    if (!targetMatch || !player) {
      return;
    }

    if (plannedPlayerIds.has(playerId)) {
      await showAlert({
        title: "เลือกซ้ำไม่ได้",
        headline: `${player.name} อยู่ใน Match ที่จัดไว้แล้ว`,
        message: "ถ้าจะย้ายไป Match อื่น ให้กดยกเลิกหรือเอาชื่อออกจากช่องเดิมก่อน",
        confirmLabel: "รับทราบ",
        color: "warning"
      });
      return;
    }

    if (targetMatch.playerIds.length >= 4) {
      await showAlert({
        title: "Match เต็มแล้ว",
        headline: `${targetMatch.label} มีครบ 4 คนแล้ว`,
        message: "กดยืนยันหรือเอาชื่อออกก่อนเลือกคนเพิ่ม",
        confirmLabel: "รับทราบ",
        color: "warning"
      });
      return;
    }

    updateSession((current) => ({
      ...current,
      plannedMatches: current.plannedMatches.map((match) =>
        match.id === targetMatch.id
          ? {
            ...match,
            playerIds: [...match.playerIds, playerId]
          }
          : match
      )
    }));
  }

  function addPlayersToPlannedMatch(matchId: string, playerIds: string[]) {
    if (isEditingLocked || !canManageSession || playerIds.length === 0) {
      return;
    }

    const targetMatch = session.plannedMatches.find((match) => match.id === matchId);
    if (!targetMatch) {
      return;
    }

    const uniquePlayerIds = Array.from(new Set(playerIds)).filter(
      (playerId) => activePlayers.some((player) => player.id === playerId) && !plannedPlayerIds.has(playerId)
    );
    const openSlots = Math.max(0, 4 - targetMatch.playerIds.length);
    const nextPlayerIds = uniquePlayerIds.slice(0, openSlots);
    if (nextPlayerIds.length === 0) {
      return;
    }

    updateSession((current) => ({
      ...current,
      plannedMatches: current.plannedMatches.map((match) =>
        match.id === targetMatch.id
          ? {
            ...match,
            playerIds: [...match.playerIds, ...nextPlayerIds]
          }
          : match
      )
    }));
  }

  function removePlayerFromPlannedMatch(matchId: string, playerId: string) {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    updateSession((current) => ({
      ...current,
      plannedMatches: current.plannedMatches.map((match) =>
        match.id === matchId
          ? {
            ...match,
            playerIds: match.playerIds.filter((currentPlayerId) => currentPlayerId !== playerId)
          }
          : match
      )
    }));
  }

  function cancelPlannedMatch(matchId: string) {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    updateSession((current) => ({
      ...current,
      plannedMatches: current.plannedMatches.map((match) =>
        match.id === matchId
          ? {
            ...match,
            playerIds: []
          }
          : match
      )
    }));
  }

  async function confirmAddingShuttleToPaidPlayers(players: Player[]): Promise<Set<string> | null> {
    const paidPlayers = players.filter((player) => player.paid);
    if (paidPlayers.length === 0) {
      return new Set();
    }

    const confirmed = await showConfirm({
      title: "มีผู้เล่นจ่ายเงินแล้ว",
      headline: `พบผู้เล่นจ่ายแล้ว ${paidPlayers.length} คน`,
      message: "หากเพิ่มลูก ระบบจะย้ายผู้เล่นเหล่านี้กลับเป็นค้างจ่ายเพื่อคำนวณยอดใหม่",
      details: paidPlayers.map((player) => ({
        label: player.name,
        value: `จ่ายแล้ว ${formatBaht(player.paidAmount ?? calculatePlayerTotal(player, session.pricing))} บาท`,
        tone: "warning" as const
      })),
      confirmLabel: "เพิ่มลูกและย้ายกลับ",
      color: "warning"
    });

    return confirmed ? new Set(paidPlayers.map((player) => player.id)) : null;
  }

  async function addMatchToNextShuttle(shuttleNumber: number) {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    const targetGroup = matchGroups.find((group) => group.shuttleNumber === shuttleNumber);
    if (!targetGroup || targetGroup.playerNames.length !== 4) {
      return;
    }

    const targetShuttleNumber = session.currentShuttleNumber;
    const currentSummary = getShuttleMarkSummary(session.players, targetShuttleNumber);
    if (currentSummary.count > 0) {
      await showAlert({
        title: "ลูกปัจจุบันมีข้อมูลแล้ว",
        headline: `ลูกที่ ${targetShuttleNumber} มี ${currentSummary.count} ติ๊กอยู่แล้ว`,
        message: "เคลียร์หรือแก้ลูกนี้ให้เรียบร้อยก่อนเพิ่ม Match เพื่อกันข้อมูลปนกัน",
        details: [
          { label: "ลูกที่", value: String(targetShuttleNumber), tone: "warning" },
          { label: "รายชื่อที่มีอยู่", value: currentSummary.names.join(", "), tone: "warning" }
        ],
        confirmLabel: "รับทราบ",
        color: "warning"
      });
      return;
    }

    const targetPlayers = session.players.filter((player) =>
      targetGroup.playerNames.includes(player.name)
    );
    if (targetPlayers.length !== 4) {
      await showAlert({
        title: "รายชื่อไม่ครบ",
        headline: "มีผู้เล่นบางคนไม่อยู่ในรายชื่อกำลังตีแล้ว",
        message: "ระบบจะเพิ่มเฉพาะคนที่ยังอยู่ในรายชื่อกำลังตี",
        confirmLabel: "รับทราบ",
        color: "warning"
      });
    }

    const confirmed = await showConfirm({
      title: "เพิ่มลูก",
      headline: `เพิ่ม ${targetPlayers.length} คนไปลูกที่ ${targetShuttleNumber}`,
      message: "ระบบจะติ๊กลูกให้ทั้ง 4 คน",
      details: [
        { label: "ลูกที่", value: String(targetShuttleNumber), tone: "primary" },
        { label: "ผู้เล่น", value: targetPlayers.map((p) => p.name).join(", "), tone: "primary" }
      ],
      confirmLabel: "เพิ่มลูก",
      color: "primary"
    });
    if (!confirmed) {
      return;
    }
    const paidPlayerIds = await confirmAddingShuttleToPaidPlayers(targetPlayers);
    if (paidPlayerIds === null) {
      return;
    }

    const confirmedAt = getTrustedNowIso();
    const restUntil = addMinutes(confirmedAt, REST_MINUTES);
    const selectedPlayerIds = new Set(targetPlayers.map((player) => player.id));
    setEditingShuttleNumber(null);
    setEditingReturnShuttleNumber(null);
    updateSession((current) => {
      const nextPlayers = current.players.map((player) =>
        selectedPlayerIds.has(player.id)
          ? setPlayerShuttleMarks(
            {
              ...player,
              paid: paidPlayerIds.has(player.id) ? false : player.paid,
              paidAt: paidPlayerIds.has(player.id) ? undefined : player.paidAt,
              paidAmount: paidPlayerIds.has(player.id) ? undefined : player.paidAmount,
              paidAccountId: paidPlayerIds.has(player.id) ? undefined : player.paidAccountId,
              restUntil,
              waitingSince: restUntil
            },
            [...getPlayerShuttleMarks(player), targetShuttleNumber]
          )
          : player
      );
      const nextSession = appendActivity(
        {
          ...current,
          players: nextPlayers,
          currentShuttleNumber: targetShuttleNumber + 1
        },
        createActivity(
          "mark-added",
          `เพิ่มลูกที่ ${targetShuttleNumber}: ${targetPlayers.map((p) => p.name).join(", ")}`,
          confirmedAt
        )
      );
      return nextSession;
    });
  }

  async function confirmPlannedMatch(matchId: string) {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    const targetMatch = session.plannedMatches.find((match) => match.id === matchId);
    if (!targetMatch || targetMatch.playerIds.length !== 4) {
      return;
    }

    const targetShuttleNumber = session.currentShuttleNumber;
    const currentSummary = getShuttleMarkSummary(session.players, targetShuttleNumber);
    if (currentSummary.count > 0) {
      await showAlert({
        title: "ลูกปัจจุบันมีข้อมูลแล้ว",
        headline: `ลูกที่ ${targetShuttleNumber} มี ${currentSummary.count} ติ๊กอยู่แล้ว`,
        message: "เคลียร์หรือแก้ลูกนี้ให้เรียบร้อยก่อนยืนยัน Match ล่วงหน้า เพื่อกันข้อมูลปนกัน",
        details: [
          { label: "ลูกที่", value: String(targetShuttleNumber), tone: "warning" },
          { label: "รายชื่อที่มีอยู่", value: currentSummary.names.join(", "), tone: "warning" }
        ],
        confirmLabel: "รับทราบ",
        color: "warning"
      });
      return;
    }

    const selectedPlayers = targetMatch.playerIds
      .map((playerId) => activePlayers.find((player) => player.id === playerId))
      .filter((player): player is Player => Boolean(player));
    if (selectedPlayers.length !== 4) {
      await showAlert({
        title: "รายชื่อไม่ครบ",
        headline: "มีผู้เล่นบางคนไม่อยู่ในรายชื่อกำลังตีแล้ว",
        message: "ระบบจะล้างชื่อที่ใช้ไม่ได้ออกจาก Match นี้ก่อนจัดใหม่",
        confirmLabel: "รับทราบ",
        color: "warning"
      });
      updateSession((current) => normalizeSession(current));
      return;
    }

    const playerNames = selectedPlayers.map((player) => player.name).join(", ");
    const confirmed = await showConfirm({
      title: "ยืนยัน Match ล่วงหน้า",
      headline: `รัน ${targetMatch.label} เป็นลูกที่ ${targetShuttleNumber}`,
      message: "ระบบจะติ๊กลูกให้ทั้ง 4 คน และเลื่อนไปลูกถัดไป",
      details: [
        { label: "ลูกที่", value: String(targetShuttleNumber), tone: "primary" },
        { label: "ผู้เล่น", value: playerNames, tone: "primary" },
        { label: "ลูกถัดไป", value: String(targetShuttleNumber + 1), tone: "primary" }
      ],
      confirmLabel: "ยืนยัน",
      color: "primary"
    });
    if (!confirmed) {
      return;
    }
    const paidPlayerIds = await confirmAddingShuttleToPaidPlayers(selectedPlayers);
    if (paidPlayerIds === null) {
      return;
    }

    const confirmedAt = getTrustedNowIso();
    const restUntil = addMinutes(confirmedAt, REST_MINUTES);
    const selectedPlayerIds = new Set(targetMatch.playerIds);
    setSelectedPlannedMatchId("");
    updateSession((current) => {
      const nextPlayers = current.players.map((player) =>
        selectedPlayerIds.has(player.id)
          ? setPlayerShuttleMarks(
            {
              ...player,
              paid: paidPlayerIds.has(player.id) ? false : player.paid,
              paidAt: paidPlayerIds.has(player.id) ? undefined : player.paidAt,
              paidAmount: paidPlayerIds.has(player.id) ? undefined : player.paidAmount,
              paidAccountId: paidPlayerIds.has(player.id) ? undefined : player.paidAccountId,
              restUntil,
              waitingSince: restUntil,
              gameCount: player.gameCount + 1
            },
            [...getPlayerShuttleMarks(player), targetShuttleNumber]
          )
          : player
      );
      const nextSession = appendActivity(
        {
          ...current,
          players: nextPlayers,
          currentShuttleNumber: targetShuttleNumber + 1,
          plannedMatches: renumberPlannedMatches([
            ...current.plannedMatches.filter((match) => match.id !== matchId),
            {
              ...targetMatch,
              playerIds: [],
              confirmed: true
            }
          ])
        },
        createActivity(
          "match-confirmed",
          `ยืนยันลูก ${targetShuttleNumber}: ${playerNames}`,
          confirmedAt
        )
      );

      return nextSession;
    });
  }

  async function toggleShuttleMark(playerId: string, column: number) {
    if (!canManageSession) {
      return;
    }

    const player = session.players.find((currentPlayer) => currentPlayer.id === playerId);
    if (!player) {
      return;
    }

    const currentMarks = getPlayerShuttleMarks(player);
    const removedShuttleNumber = currentMarks[column];
    const isRemoving = typeof removedShuttleNumber === "number";
    if (isRemoving && !(await showConfirm({
      title: "เอาติ๊กออก",
      headline: "เอาติ๊กลูกออกใช่ไหม?",
      message: "การเอาออกจะกระทบยอดลูกและ Match ของลูกนี้",
      details: [
        { label: "ผู้เล่น", value: player.name, tone: "warning" },
        { label: "ลูกที่", value: String(removedShuttleNumber), tone: "warning" }
      ],
      note: "เอาออกแน่นะอีแก่",
      confirmLabel: "เอาออก",
      color: "warning"
    }))) {
      return;
    }

    const targetShuttleNumber = isRemoving
      ? removedShuttleNumber
      : Math.max(1, editingShuttleNumber ?? session.currentShuttleNumber);
    const isEditingFlow =
      editingShuttleNumber !== null ||
      isRemoving ||
      targetShuttleNumber !== session.currentShuttleNumber;
    const returnShuttleNumber =
      editingReturnShuttleNumber ?? session.currentShuttleNumber;
    if (!isRemoving && getShuttleMarkSummary(session.players, targetShuttleNumber).count >= 4) {
      await showAlert({
        title: "ลูกนี้ครบแล้ว",
        headline: `ลูกที่ ${targetShuttleNumber} ครบ 4 ติ๊กแล้ว`,
        message: "ถ้าจะเปลี่ยนคน ให้เอาติ๊กเดิมออกก่อน แล้วค่อยเลือกใหม่",
        details: [{ label: "ลูกที่", value: String(targetShuttleNumber), tone: "warning" }],
        confirmLabel: "รับทราบ",
        color: "warning"
      });
      return;
    }
    if (
      !isRemoving &&
      getPlayerShuttleMarks(player).filter((mark) => mark === targetShuttleNumber).length > 0
    ) {
      const confirmedDuplicate = await showConfirm({
        title: "เพิ่มชื่อซ้ำ",
        headline: `เพิ่ม ${player.name} ซ้ำในลูกที่ ${targetShuttleNumber} ใช่ไหม?`,
        message: "ใช้กรณีคนเดิมถูกนับซ้ำในลูกเดียวกัน เช่น A, B, B, C",
        details: [
          { label: "ผู้เล่น", value: player.name, tone: "warning" },
          { label: "ลูกที่", value: String(targetShuttleNumber), tone: "warning" }
        ],
        confirmLabel: "เพิ่มซ้ำ",
        color: "warning"
      });
      if (!confirmedDuplicate) {
        return;
      }
    }
    const paidPlayerIds = !isRemoving
      ? await confirmAddingShuttleToPaidPlayers([player])
      : new Set<string>();
    if (paidPlayerIds === null) {
      return;
    }

    const nextPlayers = session.players.map((currentPlayer) =>
      currentPlayer.id === playerId
        ? setPlayerShuttleMarks(
          paidPlayerIds.has(currentPlayer.id)
            ? { ...currentPlayer, paid: false, paidAt: undefined, paidAmount: undefined, paidAccountId: undefined }
            : currentPlayer,
          isRemoving
            ? getPlayerShuttleMarks(currentPlayer).filter((_, markIndex) => markIndex !== column)
            : [...getPlayerShuttleMarks(currentPlayer), targetShuttleNumber]
        )
        : currentPlayer
    );

    const targetShuttleSummary = getShuttleMarkSummary(nextPlayers, targetShuttleNumber);
    const completedPlayerNames = targetShuttleSummary.names.slice(-4).join(", ");
    const overlapWarning = targetShuttleSummary.isComplete
      ? findMatchOverlapWarning(nextPlayers, targetShuttleNumber)
      : null;
    const shouldAdvanceAfterConfirm =
      !isRemoving &&
      targetShuttleSummary.isComplete &&
      targetShuttleNumber === session.currentShuttleNumber &&
      !isEditingFlow;
    const shouldAskToConfirmComplete =
      targetShuttleSummary.isComplete &&
      (shouldAdvanceAfterConfirm || isEditingFlow);
    const confirmedComplete =
      shouldAskToConfirmComplete &&
      await showConfirm({
        title: "ยืนยัน Match",
        headline: "ครบ 4 คนแล้ว",
        message: shouldAdvanceAfterConfirm
          ? "ยืนยัน Match นี้แล้วระบบจะเลื่อนไปลูกถัดไป"
          : "ยืนยัน Match นี้เพื่อจบการแก้ลูก",
        details: [
          { label: "ลูกที่", value: String(targetShuttleNumber), tone: "primary" },
          { label: "ผู้เล่น", value: completedPlayerNames, tone: "primary" },
          ...(shouldAdvanceAfterConfirm
            ? [{ label: "ลูกถัดไป", value: String(targetShuttleNumber + 1), tone: "primary" as const }]
            : []),
          ...(overlapWarning
            ? [
              {
                label: "เตือนซ้ำ",
                value: `ซ้ำกับลูกที่ ${overlapWarning.shuttleNumber} ${overlapWarning.overlapCount} คน`,
                tone: "warning" as const
              },
              {
                label: "รายชื่อซ้ำ",
                value: overlapWarning.overlapNames.join(", "),
                tone: "warning" as const
              }
            ]
            : [])
        ],
        note: overlapWarning ? "ตรวจรายชื่อซ้ำก่อนยืนยัน เพื่อกันจัดคู่เดิมติดกันเกินไป" : undefined,
        confirmLabel: "ยืนยัน",
        color: overlapWarning ? "warning" : "primary"
      });
    if (shouldAskToConfirmComplete && !confirmedComplete) {
      return;
    }
    const isConfirmedEditingComplete =
      Boolean(confirmedComplete) && isEditingFlow && !shouldAdvanceAfterConfirm;
    const rawNextShuttleNumber = shouldAdvanceAfterConfirm && confirmedComplete
      ? targetShuttleNumber + 1
      : isConfirmedEditingComplete
        ? returnShuttleNumber
        : session.currentShuttleNumber;
    const confirmedAt = getTrustedNowIso();
    const restUntil = addMinutes(confirmedAt, REST_MINUTES);
    const restedPlayers = shouldAdvanceAfterConfirm && confirmedComplete
      ? nextPlayers.map((currentPlayer) =>
        getPlayerShuttleMarks(currentPlayer).includes(targetShuttleNumber)
          ? {
            ...currentPlayer,
            restUntil,
            waitingSince: restUntil,
            gameCount: currentPlayer.gameCount + 1
          }
          : currentPlayer
      )
      : nextPlayers;

    const shouldKeepEditingShuttle =
      targetShuttleSummary.count > 0 &&
      !targetShuttleSummary.isComplete &&
      (isRemoving || editingShuttleNumber !== null);
    setEditingShuttleNumber(shouldKeepEditingShuttle ? targetShuttleNumber : null);
    setEditingReturnShuttleNumber(shouldKeepEditingShuttle ? returnShuttleNumber : null);
    updateSession((current) => {
      const nextOpenShuttleNumber = getNextOpenShuttleNumber(restedPlayers);
      let nextSession: SessionState = {
        ...current,
        players: restedPlayers,
        plannedMatches: isRemoving
          ? current.plannedMatches
          : current.plannedMatches.map((match) => ({
            ...match,
            playerIds: match.playerIds.filter((currentPlayerId) => currentPlayerId !== playerId)
          })),
        currentShuttleNumber: Math.min(rawNextShuttleNumber, nextOpenShuttleNumber)
      };
      const actionPlayerName = player.name;
      nextSession = appendActivity(
        nextSession,
        createActivity(
          isRemoving ? "mark-removed" : "mark-added",
          isRemoving
            ? `เอา ${actionPlayerName} ออกจากลูก ${targetShuttleNumber}`
            : `ติ๊ก ${actionPlayerName} ลงลูก ${targetShuttleNumber}`,
          getTrustedNowIso()
        )
      );
      if (confirmedComplete) {
        nextSession = appendActivity(
          nextSession,
          createActivity(
            "match-confirmed",
            `ยืนยันลูก ${targetShuttleNumber}: ${completedPlayerNames}`,
            confirmedAt
          )
        );
      }
      return nextSession;
    });
  }

  async function setPaid(playerId: string, paid: boolean) {
    if (isEditingLocked || !canSetPaid) {
      return;
    }

    const player = session.players.find((currentPlayer) => currentPlayer.id === playerId);
    if (!player) {
      return;
    }

    const playerTotal = calculatePlayerTotal(player, session.pricing);
    let paidAmount = playerTotal;

    if (paid) {
      const paymentResult = await showPaymentConfirm(player, playerTotal);
      if (!paymentResult.confirmed) {
        return;
      }
      paidAmount = paymentResult.amount;
    } else if (!(await showConfirm({
      title: paid ? "ยืนยันการจ่ายเงิน" : "ย้ายกลับค้างจ่าย",
      headline: paid ? "" : `ย้าย ${player.name} กลับไปค้างจ่ายใช่ไหม?`,
      message: paid ? "" : "คนนี้จะกลับไปอยู่ในรายชื่อค้างจ่าย",
      details: [
        { label: "ผู้เล่น", value: player.name, tone: paid ? "primary" : "warning" },
        ...(paid
          ? [
            {
              label: "จำนวนลูก",
              value: `${getPlayerShuttleCount(player)} ลูก`,
              tone: "primary" as const
            }
          ]
          : []),
        {
          label: "ยอดเงิน",
          value: `${formatBaht(playerTotal)} บาท`,
          tone: paid ? "primary" : "warning"
        }
      ],
      note: undefined,
      confirmLabel: paid ? "จ่ายแล้ว" : "ย้ายกลับ",
      color: paid ? "primary" : "warning"
    }))) {
      return;
    }

    const paidAt = getTrustedNowIso();

    if (hasSupabaseConfig) {
      try {
        setSyncStatus("กำลังบันทึก");
        const remote = await setRemotePlayerPayment({
          sessionId,
          playerId,
          paid,
          paidAmount: paid ? paidAmount : undefined,
          paidAccountId: paid ? selectedPaymentAccountId : undefined,
          paidAt: paid ? paidAt : undefined
        });
        applyRemoteSession(remote);
        setRemoteNotification(
          paid
            ? `${player.name} จ่ายแล้ว ${formatBaht(paidAmount)} บาท`
            : `ย้าย ${player.name} กลับไปค้างจ่าย`
        );
        return;
      } catch {
        setSyncStatus("รอส่งขึ้นเซิร์ฟเวอร์");
      }
    }

    updateSession((current) =>
      appendActivity(
        {
          ...current,
          players: current.players.map((currentPlayer) =>
            currentPlayer.id === playerId
              ? {
                ...currentPlayer,
                paid,
                paidAt: paid ? paidAt : undefined,
                paidAmount: paid ? paidAmount : undefined,
                paidAccountId: paid ? selectedPaymentAccountId : undefined
              }
              : currentPlayer
          ),
          plannedMatches: paid
            ? current.plannedMatches.map((match) => ({
              ...match,
              playerIds: match.playerIds.filter((currentPlayerId) => currentPlayerId !== playerId)
            }))
            : current.plannedMatches
        },
        createActivity(
          paid ? "paid" : "unpaid",
          paid
            ? `${player.name} จ่ายแล้ว ${formatBaht(paidAmount)} บาท`
            : `ย้าย ${player.name} กลับไปค้างจ่าย`,
          getTrustedNowIso()
        )
      )
    );
  }

  function toggleBatchPaymentMode() {
    setBatchPaymentMode((current) => !current);
    setBatchSelectedPlayerIds([]);
  }

  async function changePaymentAccount(accountId: PaymentAccountId) {
    const normalizedAccountId = normalizePaymentAccountId(accountId);

    if (!hasSupabaseConfig) {
      setSelectedPaymentAccountId(normalizedAccountId);
      return;
    }

    const previousAccountId = selectedPaymentAccountId;
    setSelectedPaymentAccountId(normalizedAccountId);

    try {
      const remoteAccountId = await savePaymentAccountSetting(normalizedAccountId);
      setSelectedPaymentAccountId(remoteAccountId);
    } catch (error) {
      console.warn("Failed to save payment account setting", error);
      setSelectedPaymentAccountId(previousAccountId);
      await showAlert({
        title: "บันทึกบัญชีรับเงินไม่สำเร็จ",
        message: "ไม่สามารถบันทึกบัญชีรับเงินลง Supabase ได้ กรุณาลองใหม่อีกครั้ง",
        confirmLabel: "รับทราบ",
        color: "warning"
      });
    }
  }

  function toggleBatchPaymentPlayer(playerId: string) {
    setBatchSelectedPlayerIds((current) =>
      current.includes(playerId)
        ? current.filter((currentId) => currentId !== playerId)
        : [...current, playerId]
    );
  }

  function openBatchPaymentDialog() {
    setBatchPaymentItems(
      batchSelectedPlayers.map((player) => {
        const calculatedAmount = calculatePlayerTotal(player, session.pricing);
        return {
          playerId: player.id,
          playerName: player.name,
          shuttleCount: getPlayerShuttleCount(player),
          calculatedAmount,
          amountDraft: String(calculatedAmount)
        };
      })
    );
    setBatchPaymentDialogOpen(true);
  }

  function distributeBatchPaymentTotal(value: string) {
    const total = parsePaymentAmount(value);
    const calculatedTotal = batchPaymentItems.reduce((sum, item) => sum + item.calculatedAmount, 0);
    let distributed = 0;
    setBatchPaymentItems((current) =>
      current.map((item, index) => {
        const amount =
          index === current.length - 1
            ? total - distributed
            : Math.round(total * (item.calculatedAmount / calculatedTotal));
        distributed += amount;
        return { ...item, amountDraft: String(Math.max(0, amount)) };
      })
    );
  }

  async function confirmBatchPayment() {
    const paidAt = getTrustedNowIso();
    const paymentAmounts = new Map(
      batchPaymentItems.map((item) => [item.playerId, parsePaymentAmount(item.amountDraft)])
    );
    const selectedIds = new Set(batchPaymentItems.map((item) => item.playerId));

    if (hasSupabaseConfig) {
      try {
        setSyncStatus("กำลังบันทึก");
        let latestRemote: Awaited<ReturnType<typeof setRemotePlayerPayment>> | null = null;
        for (const item of batchPaymentItems) {
          latestRemote = await setRemotePlayerPayment({
            sessionId,
            playerId: item.playerId,
            paid: true,
            paidAmount: paymentAmounts.get(item.playerId) ?? 0,
            paidAccountId: selectedPaymentAccountId,
            paidAt
          });
        }
        if (latestRemote) {
          applyRemoteSession(latestRemote);
        }
        setBatchPaymentDialogOpen(false);
        setBatchPaymentMode(false);
        setBatchSelectedPlayerIds([]);
        return;
      } catch {
        setSyncStatus("รอส่งขึ้นเซิร์ฟเวอร์");
      }
    }

    updateSession((current) => {
      let nextSession: SessionState = {
        ...current,
        players: current.players.map((player) =>
          selectedIds.has(player.id)
            ? {
              ...player,
              paid: true,
              paidAt,
              paidAmount: paymentAmounts.get(player.id),
              paidAccountId: selectedPaymentAccountId
            }
            : player
        ),
        plannedMatches: current.plannedMatches.map((match) => ({
          ...match,
          playerIds: match.playerIds.filter((playerId) => !selectedIds.has(playerId))
        }))
      };
      batchPaymentItems.forEach((item) => {
        nextSession = appendActivity(
          nextSession,
          createActivity(
            "paid",
            `${item.playerName} จ่ายแล้ว ${formatBaht(paymentAmounts.get(item.playerId) ?? 0)} บาท`,
            paidAt
          )
        );
      });
      return nextSession;
    });
    setBatchPaymentDialogOpen(false);
    setBatchPaymentMode(false);
    setBatchSelectedPlayerIds([]);
  }

  async function copySummary() {
    if (!canManageSession) {
      return;
    }

    const text = exportSessionSummary(session, sessionId, getTrustedNowIso());
    try {
      await window.navigator.clipboard.writeText(text);
      await showAlert({
        title: "คัดลอกสำเร็จ",
        headline: "คัดลอกสรุปแล้ว",
        message: "นำไปวางใน LINE ได้เลย",
        confirmLabel: "รับทราบ",
        color: "primary"
      });
    } catch {
      await showAlert({
        title: "สรุปรอบ",
        headline: `สรุปรอบ ${sessionId}`,
        message: text,
        confirmLabel: "ปิด",
        color: "primary"
      });
    }
  }

  function exportJsonNow() {
    if (!canManageSession) {
      return;
    }

    const normalizedSession = normalizeSession(session);
    const exportedAt = getTrustedNowIso();
    const payload = {
      app: "badminton-fee-book",
      type: "emergency-session-backup",
      version: appVersion,
      sessionId,
      exportedAt,
      state: normalizedSession
    };
    downloadTextFile(
      `badminton-${sessionId}-backup-${formatFileTimestamp(exportedAt)}.json`,
      `${JSON.stringify(payload, null, 2)}\n`
    );
  }

  async function retryPendingSync() {
    if (!canManageSession || !hasSupabaseConfig) {
      return;
    }

    const snapshot =
      pendingSyncSnapshot ??
      localStorage.getItem(getPendingSyncKey(sessionId)) ??
      serializeSession(normalizeSession(session));
    const normalizedSession = parseSessionSnapshot(snapshot, session);

    const normalizedSnapshot = serializeSession(normalizedSession);
    persistLocalSnapshot(sessionId, normalizedSnapshot);
    localStorage.setItem(getPendingSyncKey(sessionId), normalizedSnapshot);
    setPendingSyncSnapshot(normalizedSnapshot);
    setLastLocalSavedAt(new Date().toISOString());
    setSyncStatus("กำลังบันทึก");

    try {
      const remote = await saveRemoteSession(sessionId, normalizedSession, remoteRevisionRef.current);
      const remoteSnapshot = serializeSession(remote.session);
      remoteRevisionRef.current = remote.revision;
      remoteBaselineReadyRef.current = true;
      setClosedAt(remote.closedAt);
      lastRemoteSnapshotRef.current = remoteSnapshot;
      setSession(remote.session);
      persistLocalSnapshot(sessionId, remoteSnapshot);
      localStorage.removeItem(getPendingSyncKey(sessionId));
      setPendingSyncSnapshot(null);
      setSyncStatus("ซิงก์แล้ว");
    } catch (error) {
      setSyncStatus(
        error instanceof RemoteSaveConflictError
          ? "ข้อมูลชนกัน กรุณาตรวจสอบ"
          : "รอส่งขึ้นเซิร์ฟเวอร์"
      );
    }
  }

  async function finishSession() {
    if (!canManageSession || !hasSupabaseConfig) {
      return;
    }

    const confirmed = await showConfirm({
      title: "จบรอบ",
      headline: `จบรอบ ${sessionId} ใช่ไหม?`,
      message: "หลังจบรอบ ทุกเครื่องจะดูข้อมูลได้อย่างเดียวและแก้ไขเพิ่มเติมไม่ได้",
      note: "ตรวจยอดและรายชื่อให้เรียบร้อยก่อนจบรอบ",
      confirmLabel: "จบรอบ",
      color: "warning"
    });
    if (!confirmed) {
      return;
    }

    try {
      setClosedAt(await closeRemoteSession(sessionId));
      setSyncStatus("จบรอบแล้ว");
    } catch {
      await showAlert({
        title: "จบรอบไม่สำเร็จ",
        message: "ยังล็อกรอบไม่ได้ กรุณาลองใหม่อีกครั้ง",
        confirmLabel: "รับทราบ",
        color: "error"
      });
    }
  }

  const selectedPaymentAccount = getPaymentAccount(selectedPaymentAccountId);
  const paymentDialogAmount = parsePaymentAmount(paymentDialog.amountDraft);
  const paymentDialogQrImage = paymentDialogAmount
    ? createPromptPayQrUrlFromPayload(selectedPaymentAccount.payload, paymentDialogAmount)
    : "";
  const batchCalculatedTotal = batchPaymentItems.reduce((sum, item) => sum + item.calculatedAmount, 0);
  const batchPaymentTotal = batchPaymentItems.reduce(
    (sum, item) => sum + parsePaymentAmount(item.amountDraft),
    0
  );
  const batchPaymentDifference = batchPaymentTotal - batchCalculatedTotal;
  const batchPaymentQrImage = batchPaymentTotal
    ? createPromptPayQrUrlFromPayload(selectedPaymentAccount.payload, batchPaymentTotal)
    : "";

  if (!authSession) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginScreen
          loginName={loginName}
          loginPassword={loginPassword}
          loginError={loginError}
          onLoginNameChange={setLoginName}
          onLoginPasswordChange={setLoginPassword}
          onSubmit={login}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box component="main" className="appShell">
        <Snackbar
          open={Boolean(remoteNotification)}
          autoHideDuration={5000}
          message={remoteNotification}
          onClose={() => setRemoteNotification(null)}
        />
        {isStandalonePwa && hasSupabaseConfig ? (
          <Box className="pwaRefreshBar">
            <Typography component="span" className="pwaRefreshStatus">
              {syncStatus}
              {lastSyncedAt ? ` · อัปเดตล่าสุด ${formatMatchStartTime(lastSyncedAt)}` : ""}
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<RefreshIcon className={refreshingRemote ? "refreshIconSpinning" : ""} />}
              onClick={() => void refreshFromRemote()}
              disabled={refreshingRemote}
            >
              รีเฟรชข้อมูล
            </Button>
          </Box>
        ) : null}
        <Container maxWidth="xl" className="appContainer">
          <Stack spacing={3}>
            {!matchSetupMode ? (
              <Box className="appHeader">
                <Box>
                  <Typography variant="h4" component="h1" className="appTitle">
                    สมุดค่าตีแบด
                  </Typography>
                  <Typography color="text.secondary" className="appSubtitle">
                    จดลูก คิดเงิน และเช็กจ่ายแล้วในรอบเดียว
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" className="authStatus">
                  <Chip
                    label={userRole === "admin" ? "admin: ทำได้ทุกอย่าง" : "admin2: จ่ายเงินเท่านั้น"}
                    color={userRole === "admin" ? "primary" : "secondary"}
                    variant="outlined"
                  />
                  <Tooltip title={mode === "dark" ? "สลับไปโหมดสว่าง" : "สลับไปโหมดมืด"}>
                    <IconButton onClick={toggleTheme} size="small">
                      {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
                    </IconButton>
                  </Tooltip>
                  <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => router.push("/rooms")}>
                    รอบ
                  </Button>
                  <Button variant="outlined" onClick={logout}>
                    ออกจากระบบ
                  </Button>
                </Stack>
              </Box>
            ) : null}

            {!matchSetupMode ? (
            <Paper className="controlBand" elevation={0}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} className="quickControls">
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={toggleMatchSetupMode}
                  className="matchSetupToggle"
                >
                  เริ่มจัด Match
                </Button>
                <Button
                  variant="outlined"
                  endIcon={
                    <ExpandMoreIcon
                      className={settingsExpanded ? "settingsChevron expanded" : "settingsChevron"}
                    />
                  }
                  onClick={() => setSettingsExpanded((expanded) => !expanded)}
                  className="settingsToggle"
                >
                  รอบและราคา
                </Button>
                <Box component="form" onSubmit={addPlayer} className="addPlayerForm">
                  <TextField
                    label="ชื่อผู้เล่น"
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    disabled={isEditingLocked || !canManageSession}
                    fullWidth
                    autoComplete="off"
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={<AddIcon />}
                    disabled={isEditingLocked || !canManageSession}
                  >
                    เพิ่มผู้เล่น
                  </Button>
                </Box>
              </Stack>
              <Collapse in={settingsExpanded}>
                <Box className="settingsPanel">
                  <Box component="form" onSubmit={switchSession} className="roomForm">
                    <TextField
                      label="รหัสรอบ"
                      value={roomDraft}
                      onChange={(event) => setRoomDraft(event.target.value)}
                      disabled={isEditingLocked || !canManageSession}
                      autoComplete="off"
                    />
                    <Button type="submit" variant="outlined" disabled={isEditingLocked || !canManageSession}>
                      เปิดรอบ
                    </Button>
                  </Box>
                  <TextField
                    label="เลือกวันที่ย้อนหลัง"
                    type="date"
                    value={/^\d{4}-\d{2}-\d{2}$/.test(roomDraft) ? roomDraft : ""}
                    onChange={(event) => setRoomDraft(event.target.value)}
                    disabled={isEditingLocked || !canManageSession}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="ค่าเริ่มต้น"
                    type="number"
                    value={session.pricing.baseFee}
                    onChange={(event) => updatePricing("baseFee", event.target.value)}
                    disabled={isEditingLocked || !canManageSession}
                    inputProps={{ min: 0 }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">บาท</InputAdornment>
                    }}
                  />
                  <TextField
                    label="ค่าลูก"
                    type="number"
                    value={session.pricing.shuttleFee}
                    onChange={(event) => updatePricing("shuttleFee", event.target.value)}
                    disabled={isEditingLocked || !canManageSession}
                    inputProps={{ min: 0 }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">บาท</InputAdornment>
                    }}
                  />
                </Box>
              </Collapse>
              <Stack direction="row" spacing={1} className="syncBar">
                <Chip label={`รอบ ${sessionId}`} size="small" color="primary" variant="outlined" />
                {closedAt ? <Chip label="ดูอย่างเดียว" size="small" color="warning" /> : null}
                <Chip
                  label={`${syncStatus}${lastSyncedAt ? ` · อัปเดตล่าสุด ${formatMatchStartTime(lastSyncedAt)}` : ""}`}
                  size="small"
                />
              </Stack>
            </Paper>
            ) : null}

            {isEmergencySyncStatus && !matchSetupMode ? (
              <EmergencySyncPanel
                status={syncStatus}
                lastLocalSavedAt={lastLocalSavedAt}
                now={now}
                canManageSession={canManageSession}
                canRetry={hasSupabaseConfig}
                onExportJson={exportJsonNow}
                onRetrySync={retryPendingSync}
              />
            ) : null}

            <Paper className="tablePanel" elevation={0}>
              <Tabs
                value={activeTab}
                onChange={(_, nextTab: number) => {
                  if (!isEditingLocked || nextTab === 0) {
                    setActiveTab(nextTab);
                  }
                }}
                aria-label="มุมมองสมุดค่าตีแบด"
                className="sheetTabs"
                variant="scrollable"
                scrollButtons="auto"
              >
                <Tab label={`กำลังตี (${activePlayers.length})`} />
                <Tab label="จัด Match ล่วงหน้า" disabled={isEditingLocked} />
                <Tab label="สมุดจด" disabled={isEditingLocked} />
                <Tab label={`Match (${matchGroups.length})`} disabled={isEditingLocked} />
                <Tab
                  label={`สรุปจ่ายแล้ว (${formatBaht(summary.paidAmount)} บาท)`}
                  disabled={isEditingLocked}
                />
                <Tab label="จัดการข้อมูล" disabled={isEditingLocked} />
              </Tabs>
              <Divider />

              {activeTab === 0 ? (
                <Box className="sheetContent">
                  <Box className="sheetToolbar">
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <TextField
                        label="ค้นหาชื่อ"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="searchField"
                        autoComplete="off"
                      />
                      <ToggleButtonGroup
                        value={playerSortMode}
                        exclusive
                        onChange={(_, nextValue: "queue" | "alphabetical" | null) => {
                          if (nextValue) {
                            setPlayerSortMode(nextValue);
                          }
                        }}
                        size="small"
                        aria-label="ตัวเลือกการเรียงรายชื่อ"
                      >
                        <ToggleButton value="queue" aria-label="เรียงตามคิว">
                          ตามคิว
                        </ToggleButton>
                        <ToggleButton value="alphabetical" aria-label="เรียงตามอักษร">
                          ก-ฮ
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography fontWeight={800}>ลูกที่</Typography>
                      <IconButton
                        aria-label="ลดลูก number"
                        onClick={() => stepCurrentShuttleNumber(-1)}
                        disabled={isEditingMode || !canManageSession || activeShuttleNumber <= 1}
                      >
                        <RemoveIcon />
                      </IconButton>
                      <TextField
                        label="ลูกที่"
                        type="number"
                        value={activeShuttleNumber}
                        onChange={(event) => updateCurrentShuttleNumber(event.target.value)}
                        disabled={isEditingMode || !canManageSession}
                        inputProps={{ min: 1, "aria-label": "ลูก number" }}
                        className="currentShuttleField"
                      />
                      <IconButton
                        aria-label="เพิ่มลูก number"
                        onClick={() => stepCurrentShuttleNumber(1)}
                        disabled={isEditingMode || !canManageSession}
                      >
                        <AddIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                  <CurrentShuttlePicker
                    summary={currentShuttleSummary}
                    players={visibleActivePlayers}
                    voicePlayers={activePlayers}
                    allPlayerCount={activePlayers.length}
                    hasSearch={Boolean(normalizedSearch)}
                    activeShuttleNumber={activeShuttleNumber}
                    sortMode={playerSortMode}
                    now={now}
                    isEditingMode={isEditingMode}
                    isEditingLocked={isEditingLocked}
                    canManageSession={canManageSession}
                    onTogglePlayer={addActiveShuttlePlayer}
                    onRemovePlayer={removeActiveShuttlePlayer}
                  />
                  <PriorityPlayers players={priorityPlayers} now={now} />
                </Box>
              ) : activeTab === 1 ? (
                <PlannedMatchPanel
                  plannedMatches={session.plannedMatches}
                  selectedMatchId={selectedPlannedMatch?.id ?? ""}
                  activePlayers={activePlayers}
                  availablePlayers={activePlayers}
                  plannedPlayerIds={plannedPlayerIds}
                  playerSortMode={playerSortMode}
                  onPlayerSortModeChange={setPlayerSortMode}
                  currentShuttleNumber={session.currentShuttleNumber}
                  canManageSession={canManageSession}
                  now={now}
                  onSelectMatch={setSelectedPlannedMatchId}
                  onAddPlayer={addPlayerToPlannedMatch}
                  onRemovePlayer={removePlayerFromPlannedMatch}
                  onCancelMatch={cancelPlannedMatch}
                  onConfirmMatch={confirmPlannedMatch}
                />
              ) : activeTab === 2 ? (
                <>
                  <Box className="ledgerToolbar">
                    <TextField
                      label="ค้นหาชื่อในสมุด"
                      value={ledgerSearchName}
                      onChange={(event) => setLedgerSearchName(event.target.value)}
                      className="searchField"
                      autoComplete="off"
                    />
                    <TextField
                      label="เลขลูก"
                      type="number"
                      value={ledgerSearchShuttle}
                      onChange={(event) => setLedgerSearchShuttle(event.target.value)}
                      className="ledgerShuttleSearchField"
                      inputProps={{ min: 1 }}
                    />
                    <Button
                      variant={batchPaymentMode ? "outlined" : "contained"}
                      onClick={toggleBatchPaymentMode}
                      disabled={!canSetPaid}
                    >
                      {batchPaymentMode ? "ยกเลิกเลือก" : "เลือกคิดเงินรวม"}
                    </Button>
                  </Box>
                  <ScoreSheet
                    activePlayers={visibleLedgerPlayers}
                    allPlayerCount={session.players.length}
                    hasSearch={Boolean(normalizedLedgerSearchName || ledgerSearchShuttle.trim())}
                    incompleteShuttleNumbers={incompleteShuttleNumbers}
                    overLimitShuttleNumbers={overLimitShuttleNumbers}
                    shuttleSourceMap={shuttleSourceMap}
                    now={now}
                    pricing={session.pricing}
                    shuttleColumns={shuttleColumns}
                    activeShuttleNumber={activeShuttleNumber}
                    filteredShuttleNumber={searchedLedgerShuttleNumber}
                    editingShuttleNumber={editingShuttleNumber}
                    isEditingLocked={isEditingLocked}
                    canManageSession={canManageSession}
                    canSetPaid={canSetPaid}
                    onRemovePlayer={removePlayer}
                    onSetPaid={setPaid}
                    onToggleShuttleMark={(id) => setLedgerSelectedPlayerId(id)}
                    selectedPlayerId={ledgerSelectedPlayerId}
                    batchPaymentMode={batchPaymentMode}
                    batchSelectedPlayerIds={batchSelectedPlayerIds}
                    onToggleBatchPaymentPlayer={toggleBatchPaymentPlayer}
                  />
                  {batchPaymentMode ? (
                    <Paper className="batchPaymentBar" elevation={4}>
                      <Typography fontWeight={800}>เลือกแล้ว {batchSelectedPlayers.length} คน</Typography>
                      <Typography>ยอดรวม {formatBaht(batchSelectedTotal)} บาท</Typography>
                      <Button
                        variant="contained"
                        disabled={batchSelectedPlayers.length < 2}
                        onClick={openBatchPaymentDialog}
                      >
                        คิดเงินรวม
                      </Button>
                    </Paper>
                  ) : null}
                </>
              ) : activeTab === 3 ? (
                <MatchSummaryPanel
                  matchGroups={matchGroups}
                  searchTerm={matchSearchTerm}
                  targetShuttleNumber={session.currentShuttleNumber}
                  targetShuttleMarkCount={targetShuttleSummary.count}
                  onSearchTermChange={setMatchSearchTerm}
                  onAddMatchToNextShuttle={addMatchToNextShuttle}
                  canManageSession={canManageSession}
                />
              ) : activeTab === 4 ? (
                <>
                  <PaidSummary
                    players={session.players}
                    paidGroups={visiblePaidGroups}
                    hasSearch={Boolean(normalizedSearch)}
                    onSetPaid={setPaid}
                    canSetPaid={canSetPaid}
                  />
                  <Box className="summaryGrid">
                    <SummaryStat
                      label="ลูกทั้งหมด"
                      value={`${summary.shuttleCount} ลูก`}
                      tone={noteShuttleSummary.missingCount > 0 ? "danger" : undefined}
                      note={
                        noteShuttleSummary.missingCount > 0
                          ? `ลูกที่ ${noteShuttleSummary.shuttleNumber} ยังไม่ครบ 4 ติ๊ก เหลืออีก ${noteShuttleSummary.missingCount} ติ๊ก`
                          : undefined
                      }
                    />
                    <Button
                      className="mobileSummaryToggle"
                      variant="outlined"
                      onClick={() => setMobileSummaryExpanded((expanded) => !expanded)}
                      endIcon={
                        <ExpandMoreIcon
                          className={mobileSummaryExpanded ? "expandIconOpen" : undefined}
                        />
                      }
                    >
                      {mobileSummaryExpanded ? "ซ่อนสรุป" : "ดูสรุปทั้งหมด"}
                    </Button>
                    <Box
                      className={`summarySecondary${mobileSummaryExpanded ? " summarySecondaryOpen" : ""}`}
                    >
                      <SummaryStat label="ผู้เล่น" value={`${summary.playerCount} คน`} />
                      <SummaryStat
                        label="รวม"
                        value={`ยอดรวม ${formatBaht(summary.totalAmount)} บาท`}
                      />
                      <SummaryStat
                        label="จ่ายแล้ว"
                        value={`จ่ายแล้ว ${formatBaht(summary.paidAmount)} บาท`}
                      />
                      <SummaryStat
                        label="ค้างจ่าย"
                        value={`ค้างจ่าย ${formatBaht(summary.unpaidAmount)} บาท`}
                      />
                    </Box>
                  </Box>
                </>
              ) : (
                <DataManagementPanel
                  onClearPlayData={clearPlayData}
                  onResetSession={resetSession}
                  onCopySummary={copySummary}
                  onFinishSession={finishSession}
                  selectedPaymentAccountId={selectedPaymentAccountId}
                  onPaymentAccountChange={changePaymentAccount}
                  sessionClosed={Boolean(closedAt)}
                  canFinishSession={userRole === "admin" && hasSupabaseConfig}
                  matchSetupMode={matchSetupMode}
                  onToggleMatchSetupMode={toggleMatchSetupMode}
                  canManageSession={canManageSession}
                />
              )}
            </Paper>
            <Typography className="appFooter" component="footer">
              v{appVersion}
            </Typography>
          </Stack>
        </Container>
      </Box>
      <Dialog
        open={paymentDialog.open}
        onClose={() => closePaymentDialog(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ className: "appDialogPaper" }}
      >
        <DialogTitle className="appDialogTitle appDialogTitle-primary">
          ยืนยันการจ่ายเงิน
        </DialogTitle>
        <DialogContent className="appDialogContent">
          <Box className="appDialogDetails">
            <Box className="appDialogDetail appDialogDetail-primary">
              <Typography className="appDialogDetailLabel">ผู้เล่น</Typography>
              <Typography className="appDialogDetailValue">{paymentDialog.playerName}</Typography>
            </Box>
            <Box className="appDialogDetail appDialogDetail-primary">
              <Typography className="appDialogDetailLabel">จำนวนลูก</Typography>
              <Typography className="appDialogDetailValue">{paymentDialog.shuttleCount} ลูก</Typography>
            </Box>
          </Box>
          <TextField
            label="ยอดเงิน"
            type="text"
            value={paymentDialog.amountDraft}
            onChange={(event) => {
              const digitsOnly = event.target.value.replace(/[^0-9]/g, "");
              setPaymentDialog((current) => ({
                ...current,
                amountDraft: digitsOnly
              }));
            }}
            fullWidth
            autoComplete="off"
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            InputProps={{
              endAdornment: <InputAdornment position="end">บาท</InputAdornment>
            }}
          />
          {paymentDialog.calculatedAmount !== paymentDialogAmount && paymentDialogAmount > 0 ? (
            <Typography className="paymentDialogCalculatedAmount" color="text.secondary">
              ยอดคำนวณเดิม {formatBaht(paymentDialog.calculatedAmount)} บาท
            </Typography>
          ) : null}
          {paymentDialogQrImage ? (
            <Box className="appDialogImageWrap">
              <Box
                component="img"
                src={paymentDialogQrImage}
                alt={`PromptPay QR สำหรับจ่าย ${formatBaht(paymentDialogAmount)} บาท`}
                className="appDialogImage"
              />
            </Box>
          ) : null}
          <Box className="paymentDialogAccount">
            <Box
              component="img"
              src={selectedPaymentAccount.logoSrc}
              alt=""
              aria-hidden="true"
              className="paymentDialogAccountLogo"
            />
            <Box>
              <Typography className="paymentDialogAccountName">
                {selectedPaymentAccount.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                PromptPay {selectedPaymentAccount.promptPayDisplay}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions className="appDialogActions">
          <Button variant="outlined" onClick={() => closePaymentDialog(false)}>
            ยกเลิก
          </Button>
          <Button
            variant="contained"
            onClick={() => closePaymentDialog(true)}
            disabled={paymentDialogAmount <= 0}
          >
            จ่ายแล้ว
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={batchPaymentDialogOpen}
        onClose={() => setBatchPaymentDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ className: "appDialogPaper" }}
      >
        <DialogTitle className="appDialogTitle appDialogTitle-primary">
          ยืนยันการจ่ายเงินรวม
        </DialogTitle>
        <DialogContent className="appDialogContent">
          <Stack spacing={2}>
            {batchPaymentItems.map((item) => (
              <Box key={item.playerId} className="batchPaymentItem">
                <Box>
                  <Typography fontWeight={800}>{item.playerName}</Typography>
                  <Typography color="text.secondary">
                    {item.shuttleCount} ลูก · ยอดคำนวณ {formatBaht(item.calculatedAmount)} บาท
                  </Typography>
                </Box>
                <TextField
                  label={`ยอดรับจริง ${item.playerName}`}
                  value={item.amountDraft}
                  onChange={(event) => {
                    const amountDraft = event.target.value.replace(/[^0-9]/g, "");
                    setBatchPaymentItems((current) =>
                      current.map((currentItem) =>
                        currentItem.playerId === item.playerId
                          ? { ...currentItem, amountDraft }
                          : currentItem
                      )
                    );
                  }}
                  inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
                  InputProps={{ endAdornment: <InputAdornment position="end">บาท</InputAdornment> }}
                />
              </Box>
            ))}
            <Divider />
            <Typography>ยอดคำนวณรวม {formatBaht(batchCalculatedTotal)} บาท</Typography>
            <TextField
              label="ยอดรับจริงรวม"
              value={String(batchPaymentTotal)}
              onChange={(event) => distributeBatchPaymentTotal(event.target.value.replace(/[^0-9]/g, ""))}
              inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
              InputProps={{ endAdornment: <InputAdornment position="end">บาท</InputAdornment> }}
            />
            {batchPaymentDifference !== 0 ? (
              <Typography color={batchPaymentDifference < 0 ? "warning.main" : "primary.main"}>
                {batchPaymentDifference < 0 ? "ส่วนลดรวม" : "จ่ายเพิ่มรวม"}{" "}
                {formatBaht(Math.abs(batchPaymentDifference))} บาท
              </Typography>
            ) : null}
            {batchPaymentQrImage ? (
              <Box className="appDialogImageWrap">
                <Box
                  component="img"
                  src={batchPaymentQrImage}
                  alt={`PromptPay QR สำหรับจ่าย ${formatBaht(batchPaymentTotal)} บาท`}
                  className="appDialogImage"
                />
              </Box>
            ) : null}
            <Box className="paymentDialogAccount">
              <Box
                component="img"
                src={selectedPaymentAccount.logoSrc}
                alt=""
                aria-hidden="true"
                className="paymentDialogAccountLogo"
              />
              <Box>
                <Typography className="paymentDialogAccountName">
                  {selectedPaymentAccount.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  PromptPay {selectedPaymentAccount.promptPayDisplay}
                </Typography>
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions className="appDialogActions">
          <Button variant="outlined" onClick={() => setBatchPaymentDialogOpen(false)}>ยกเลิก</Button>
          <Button
            variant="contained"
            disabled={batchPaymentItems.some((item) => parsePaymentAmount(item.amountDraft) <= 0)}
            onClick={confirmBatchPayment}
          >
            จ่ายแล้วทั้งหมด
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={dialog.open}
        onClose={() => closeDialog(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ className: "appDialogPaper" }}
      >
        <DialogTitle className={`appDialogTitle appDialogTitle-${dialog.color ?? "primary"}`}>
          {dialog.title}
        </DialogTitle>
        <DialogContent className="appDialogContent">
          {dialog.headline ? (
            <Typography className="appDialogHeadline" component="p">
              {dialog.headline}
            </Typography>
          ) : null}
          <DialogContentText className="appDialogMessage">{dialog.message}</DialogContentText>
          {dialog.details && dialog.details.length > 0 ? (
            <Box className="appDialogDetails">
              {dialog.details.map((detail) => (
                <Box
                  key={`${detail.label}-${detail.value}`}
                  className={`appDialogDetail appDialogDetail-${detail.tone ?? dialog.color ?? "primary"}`}
                >
                  <Typography className="appDialogDetailLabel">{detail.label}</Typography>
                  <Typography className="appDialogDetailValue">{detail.value}</Typography>
                </Box>
              ))}
            </Box>
          ) : null}
          {dialog.image ? (
            <Box className="appDialogImageWrap">
              <Box
                component="img"
                src={dialog.image.src}
                alt={dialog.image.alt}
                className="appDialogImage"
              />
              {dialog.image.caption ? (
                <Typography className="appDialogImageCaption">
                  {dialog.image.caption}
                </Typography>
              ) : null}
            </Box>
          ) : null}
          {dialog.note ? (
            <Typography textAlign="center" className={`appDialogNote appDialogNote-${dialog.color ?? "primary"}`}>
              {dialog.note}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions className="appDialogActions">
          {dialog.mode === "confirm" ? (
            <Button variant="outlined" onClick={() => closeDialog(false)}>
              {dialog.cancelLabel ?? "ยกเลิก"}
            </Button>
          ) : null}
          <Button
            variant="contained"
            color={dialog.color ?? "primary"}
            onClick={() => closeDialog(true)}
            autoFocus
          >
            {dialog.confirmLabel ?? "ตกลง"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={addPlayerDialogOpen}
        onClose={closeAddPlayerDialog}
        fullWidth
        maxWidth="xs"
        PaperProps={{ className: "addPlayerDialogPaper" }}
      >
        <Box component="form" onSubmit={addPlayerFromDialog}>
          <DialogTitle>เพิ่มผู้เล่น</DialogTitle>
          <DialogContent className="addPlayerDialogContent">
            <TextField
              label="ชื่อผู้เล่น"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              disabled={isEditingLocked || !canManageSession}
              fullWidth
              autoComplete="off"
              autoFocus
              inputRef={addPlayerInputRef}
            />
          </DialogContent>
          <DialogActions className="addPlayerDialogActions">
            <Button onClick={closeAddPlayerDialog}>ยกเลิก</Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<AddIcon />}
              disabled={isEditingLocked || !canManageSession}
            >
              เพิ่มผู้เล่น
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      {matchSetupMode ? (
        <Tooltip title="เพิ่มผู้เล่น">
          <span className="matchSetupAddPlayerFabWrap">
            <Fab
              color="primary"
              aria-label="เพิ่มผู้เล่น"
              className="matchSetupAddPlayerFab"
              onClick={() => setAddPlayerDialogOpen(true)}
              disabled={isEditingLocked || !canManageSession}
            >
              <AddIcon />
            </Fab>
          </span>
        </Tooltip>
      ) : null}
    </ThemeProvider>
  );
}

function EmergencySyncPanel({
  status,
  lastLocalSavedAt,
  now,
  canManageSession,
  canRetry,
  onExportJson,
  onRetrySync
}: {
  status: string;
  lastLocalSavedAt: string | null;
  now: string;
  canManageSession: boolean;
  canRetry: boolean;
  onExportJson: () => void;
  onRetrySync: () => void;
}) {
  const detailText = lastLocalSavedAt
    ? `บันทึกในเครื่องล่าสุด ${formatRelativeTime(lastLocalSavedAt, now)}`
    : "ระบบจะเก็บข้อมูลในเครื่องนี้ก่อน";

  return (
    <Paper className="emergencySyncPanel" elevation={0} role="status">
      <Box className="emergencySyncText">
        <Typography fontWeight={900}>
          {status === "ข้อมูลชนกัน กรุณาตรวจสอบ" ? "พบข้อมูลจากอีกเครื่อง" : "ระบบกำลังออฟไลน์"}
        </Typography>
        <Typography color="text.secondary">
          {status === "รอส่งขึ้นเซิร์ฟเวอร์"
            ? "ข้อมูลล่าสุดอยู่ในเครื่องนี้แล้ว และรอส่งขึ้นเซิร์ฟเวอร์อีกครั้ง"
            : status === "ข้อมูลชนกัน กรุณาตรวจสอบ"
              ? "เครื่องนี้มีข้อมูลที่ยังไม่ซิงก์ จึงยังไม่รับข้อมูลจากอีกเครื่องมาทับ"
            : "ตอนนี้ใช้ข้อมูลจากเครื่องนี้ ถ้าเซิร์ฟเวอร์กลับมาแล้วค่อยลองซิงก์ใหม่"}
        </Typography>
        <Typography className="emergencySyncNote">{detailText}</Typography>
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} className="emergencySyncActions">
        <Button variant="contained" color="warning" onClick={onExportJson} disabled={!canManageSession}>
          Export JSON ตอนนี้
        </Button>
        <Button
          variant="outlined"
          color="warning"
          onClick={onRetrySync}
          disabled={!canManageSession || !canRetry}
        >
          ลองซิงก์ใหม่
        </Button>
      </Stack>
    </Paper>
  );
}

function LoginScreen({
  loginName,
  loginPassword,
  loginError,
  onLoginNameChange,
  onLoginPasswordChange,
  onSubmit
}: {
  loginName: string;
  loginPassword: string;
  loginError: string;
  onLoginNameChange: (value: string) => void;
  onLoginPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Box component="main" className="loginShell">
      <Paper className="loginPanel" elevation={0}>
        <Box>
          <Typography variant="h4" component="h1" className="appTitle">
            สมุดค่าตีแบด
          </Typography>
          <Typography color="text.secondary">
            เข้าสู่ระบบเพื่อจัดการรอบตีแบด
          </Typography>
        </Box>
        <Box component="form" className="loginForm" onSubmit={onSubmit}>
          <TextField
            label="ชื่อผู้ใช้"
            value={loginName}
            onChange={(event) => onLoginNameChange(event.target.value)}
            autoComplete="username"
            autoFocus
            fullWidth
          />
          <TextField
            label="รหัสผ่าน"
            type="password"
            value={loginPassword}
            onChange={(event) => onLoginPasswordChange(event.target.value)}
            autoComplete="current-password"
            fullWidth
          />
          {loginError ? (
            <Typography color="error" fontWeight={700}>
              {loginError}
            </Typography>
          ) : null}
          <Button type="submit" variant="contained" fullWidth>
            เข้าสู่ระบบ
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

function ScoreSheet({
  activePlayers,
  allPlayerCount,
  hasSearch,
  incompleteShuttleNumbers,
  overLimitShuttleNumbers,
  shuttleSourceMap,
  now,
  pricing,
  shuttleColumns,
  activeShuttleNumber,
  filteredShuttleNumber,
  editingShuttleNumber,
  isEditingLocked,
  canManageSession,
  canSetPaid,
  onRemovePlayer,
  onSetPaid,
  onToggleShuttleMark,
  selectedPlayerId,
  batchPaymentMode,
  batchSelectedPlayerIds,
  onToggleBatchPaymentPlayer
}: {
  activePlayers: Player[];
  allPlayerCount: number;
  hasSearch: boolean;
  incompleteShuttleNumbers: ReadonlySet<number>;
  overLimitShuttleNumbers: ReadonlySet<number>;
  shuttleSourceMap: ReadonlyMap<number, 'batch' | 'planned' | 'manual' | undefined>;
  now: string;
  pricing: SessionState["pricing"];
  shuttleColumns: number[];
  activeShuttleNumber: number;
  filteredShuttleNumber: number | null;
  editingShuttleNumber: number | null;
  isEditingLocked: boolean;
  canManageSession: boolean;
  canSetPaid: boolean;
  onRemovePlayer: (id: string) => void;
  onSetPaid: (id: string, paid: boolean) => void;
  onToggleShuttleMark: (id: string, column: number) => void;
  selectedPlayerId?: string | null;
  batchPaymentMode: boolean;
  batchSelectedPlayerIds: string[];
  onToggleBatchPaymentPlayer: (id: string) => void;
}) {
  return (
    <TableContainer className="scoreTableWrap">
      <Table stickyHeader size="small" aria-label="ตารางค่าตีแบด">
        <TableHead>
          <TableRow>
            {batchPaymentMode ? <TableCell align="center" className="stickySelect">เลือก</TableCell> : null}
            <TableCell className={`stickyName${batchPaymentMode ? " stickyNameAfterSelect" : ""}`}>ชื่อ</TableCell>
            {shuttleColumns.map((column) => (
              <TableCell key={column} align="center" className="shuttleHeader">
                {column + 1}
              </TableCell>
            ))}
            <TableCell align="center">ลูก</TableCell>
            <TableCell align="center">เกม</TableCell>
            <TableCell align="right" className="stickyAction stickyAmount">ยอด</TableCell>
            <TableCell align="center" className="stickyAction stickyPaid">จ่ายแล้ว</TableCell>
            <TableCell align="center" className="stickyAction stickyDelete">ลบ</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {activePlayers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={shuttleColumns.length + 6 + (batchPaymentMode ? 1 : 0)} className="emptyCell">
                {hasSearch
                  ? "ไม่พบชื่อที่ค้นหา"
                  : allPlayerCount === 0
                    ? "เพิ่มชื่อผู้เล่นเพื่อเริ่มจดลูก"
                    : "ไม่มีผู้เล่นค้างจ่าย"}
              </TableCell>
            </TableRow>
          ) : (
            activePlayers.map((player, playerIndex) => (
              <TableRow
                key={player.id}
                hover
                aria-label={player.name}
                className={`${getWaitingRowClass(player, now)}${
                  selectedPlayerId === player.id ? " ledgerSelectedRow" : ""
                }`}
              >
                {batchPaymentMode ? (
                  <TableCell align="center" className="stickySelect">
                    <Checkbox
                      inputProps={{ "aria-label": `เลือก ${player.name} คิดเงินรวม` }}
                      checked={batchSelectedPlayerIds.includes(player.id)}
                      onChange={() => onToggleBatchPaymentPlayer(player.id)}
                    />
                  </TableCell>
                ) : null}
                <TableCell className={`stickyName playerCell${batchPaymentMode ? " stickyNameAfterSelect" : ""}`}>
                  <Button
                    className="playerNameButton"
                    aria-label={`ติ๊กลูกให้ ${player.name}`}
                    onClick={() => onToggleShuttleMark(player.id, getPlayerShuttleCount(player))}
                    disabled={!canManageSession}
                    fullWidth
                  >
                    <span className="playerOrder">{playerIndex + 1}</span>
                    <span className="playerNameText">{player.name}</span>
                  </Button>
                </TableCell>
                {shuttleColumns.map((column) => (
                  <TableCell key={column} align="center" className="shuttleCell">
                    {(() => {
                      const shuttleMark = getPlayerShuttleMarks(player)[column];
                      const checked = typeof shuttleMark === "number";
                      const isFilteredOut =
                        filteredShuttleNumber !== null && shuttleMark !== filteredShuttleNumber;
                      if (isFilteredOut) {
                        return <span className="emptyShuttleCell" aria-hidden="true" />;
                      }
                      const isOverLimit =
                        typeof shuttleMark === "number" &&
                        overLimitShuttleNumbers.has(shuttleMark);
                      const isIncomplete =
                        typeof shuttleMark === "number" &&
                        incompleteShuttleNumbers.has(shuttleMark);
                      const isBatch =
                        typeof shuttleMark === "number" &&
                        shuttleSourceMap.get(shuttleMark) === 'batch';
                      const isLockedOtherShuttle =
                        isEditingLocked &&
                        typeof shuttleMark === "number" &&
                        shuttleMark !== editingShuttleNumber;
                      const isDisabled = !checked || !canManageSession || isLockedOtherShuttle;
                      return (
                        <Checkbox
                          inputProps={{
                            "aria-label": checked
                              ? `${player.name} ช่องที่ ${column + 1} ลูก ${shuttleMark}`
                              : `${player.name} ช่องที่ ${column + 1}`
                          }}
                          checked={checked}
                          disabled={isDisabled}
                          onChange={() => onToggleShuttleMark(player.id, column)}
                          icon={<SportsTennisIcon fontSize="small" />}
                          checkedIcon={
                            <span
                              className={`shuttleNumberIcon shuttleNumberIconChecked${isOverLimit ? " shuttleNumberIconDanger" : ""
                                }${isIncomplete ? " shuttleNumberIconWarning" : ""}${isBatch ? " shuttleNumberIconBatch" : ""}`}
                            >
                              {shuttleMark}
                            </span>
                          }
                        />
                      );
                    })()}
                  </TableCell>
                ))}
                <TableCell
                  align="center"
                  className="countCell"
                  aria-label={`${player.name} จำนวนลูก ${getPlayerShuttleCount(player)}`}
                >
                  {getPlayerShuttleCount(player)}
                </TableCell>
                <TableCell
                  align="center"
                  className="countCell"
                  aria-label={`${player.name} จำนวนเกม ${player.gameCount}`}
                >
                  {player.gameCount}
                </TableCell>
                <TableCell align="right" className="amountCell stickyAction stickyAmount">
                  {formatBaht(calculatePlayerTotal(player, pricing))}
                </TableCell>
                <TableCell align="center" className="stickyAction stickyPaid">
                  <Checkbox
                    inputProps={{ "aria-label": `${player.name} จ่ายแล้ว` }}
                    checked={player.paid}
                    disabled={batchPaymentMode || isEditingLocked || !canSetPaid}
                    onChange={(event) => onSetPaid(player.id, event.target.checked)}
                  />
                </TableCell>
                <TableCell align="center" className="stickyAction stickyDelete">
                  <Tooltip title={`ลบ ${player.name}`}>
                    <span>
                      <IconButton
                        aria-label={`ลบ ${player.name}`}
                        color="error"
                        disabled={isEditingLocked || !canManageSession}
                        onClick={() => onRemovePlayer(player.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function getWaitingRowClass(player: Player, now: string): string {
  const status = getPlayerWaitStatus(player, now);
  if (status === "danger") {
    return "waitingDangerRow";
  }
  if (status === "warning") {
    return "waitingWarningRow";
  }
  return "";
}

function PlayerSkillLevelPicker({
  value,
  onChange,
  disabled
}: {
  value: PlayerSkillLevel;
  onChange: (value: PlayerSkillLevel) => void;
  disabled: boolean;
}) {
  return (
    <Box className="playerSkillPicker">
      <PlayerSkillLevelToggle value={value} onChange={onChange} disabled={disabled} />
    </Box>
  );
}

function PlayerSkillLevelToggle({
  value,
  onChange,
  disabled,
  label = "เลือกระดับมือผู้เล่น"
}: {
  value: PlayerSkillLevel;
  onChange: (value: PlayerSkillLevel) => void;
  disabled: boolean;
  label?: string;
}) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      size="small"
      onChange={(_, nextValue: PlayerSkillLevel | null) => {
        if (nextValue) {
          onChange(nextValue);
        }
      }}
      disabled={disabled}
      aria-label={label}
    >
      {PLAYER_SKILL_LEVELS.map((skillLevel) => (
        <ToggleButton key={skillLevel} value={skillLevel} aria-label={`ระดับ ${PLAYER_SKILL_LABELS[skillLevel]}`}>
          {PLAYER_SKILL_LABELS[skillLevel]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function PlayerSkillBadge({ skillLevel }: { skillLevel: PlayerSkillLevel }) {
  return <span className="playerSkillBadge">{PLAYER_SKILL_LABELS[skillLevel]}</span>;
}

function CurrentShuttlePicker({
  summary,
  players,
  voicePlayers,
  allPlayerCount,
  hasSearch,
  activeShuttleNumber,
  sortMode,
  now,
  isEditingMode,
  isEditingLocked,
  canManageSession,
  onTogglePlayer,
  onRemovePlayer
}: {
  summary: ReturnType<typeof getShuttleMarkSummary>;
  players: Player[];
  voicePlayers: Player[];
  allPlayerCount: number;
  hasSearch: boolean;
  activeShuttleNumber: number;
  sortMode: "queue" | "alphabetical";
  now: string;
  isEditingMode: boolean;
  isEditingLocked: boolean;
  canManageSession: boolean;
  onTogglePlayer: (id: string) => void;
  onRemovePlayer: (id: string) => void;
}) {
  const statusText =
    summary.count === 0
      ? "ยังไม่ได้ติ๊ก"
      : summary.isComplete
        ? "ครบ 4 แล้ว"
        : `เหลืออีก ${summary.missingCount} ติ๊ก`;
  const isFull = summary.count >= 4;
  const enableAlphabetGrouping = sortMode === "alphabetical";
  const groupedPlayers = useMemo(() => {
    const groups: Array<{ label: string; players: Player[] }> = [];
    players.forEach((player) => {
      const label = getPlayerInitialGroupLabel(player.name);
      const existingGroup = groups.find((group) => group.label === label);
      if (existingGroup) {
        existingGroup.players.push(player);
      } else {
        groups.push({ label, players: [player] });
      }
    });
    return groups;
  }, [players]);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(112);
  useEffect(() => {
    const element = stickyHeaderRef.current;
    if (!element) {
      return;
    }
    const updateHeight = () => {
      const nextHeight = element.getBoundingClientRect().height;
      if (nextHeight > 0) {
        setStickyHeaderHeight(nextHeight);
      }
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const handleJumpToGroup = useCallback((label: string) => {
    const target = groupRefs.current[label];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <>
      <Box className="currentShuttlePickerSticky" ref={stickyHeaderRef}>
        <Box className="currentShuttlePickerHeader">
          <Box>
            <Typography variant="h6" component="h2" fontWeight={900}>
              {isEditingMode ? "กำลังแก้ลูก" : "เลือกคนลูก"} {activeShuttleNumber}
            </Typography>

            {isEditingMode ? (
              <Typography color="warning.main" className="currentShuttleLockNote">
                {isEditingLocked
                  ? "แก้ลูกนี้ให้ครบก่อน ระบบจะล็อกปุ่มอื่นไว้เพื่อกันเลขลูกเพี้ยน"
                  : "ลูกนี้ครบแล้ว กดยืนยัน Match เพื่อกลับไปลูกปัจจุบัน"}
              </Typography>
            ) : null}
            <Typography color="text.secondary" className="currentShuttleNames">
              {summary.names.length == 0 && "ยังไม่มีชื่อที่ติ๊ก"}
            </Typography>
          </Box>
          <Chip
            label={`${summary.count}/4 ${statusText}`}
            color={summary.isComplete ? "primary" : isFull ? "error" : "default"}
            variant={summary.isComplete ? "filled" : "outlined"}
          />
        </Box>
        {summary.entries.length > 0 ? (
          <Box className="selectedPlayerStrip" aria-label="คนที่เลือกแล้ว">
            {summary.entries.map((entry, index) => (
              <Chip
                key={`${entry.playerId}-${entry.columnIndex}`}
                label={`${index + 1}. ${entry.playerName}`}
                className="selectedPlayerChip"
                onDelete={canManageSession ? () => onRemovePlayer(entry.playerId) : undefined}
              />
            ))}
          </Box>
        ) : null}
      </Box>
      <Paper
        className="currentShuttlePicker"
        elevation={0}
        role="region"
        aria-label="เลือกคนลงลูก"
        style={{ "--picker-sticky-height": `${stickyHeaderHeight}px` } as CSSProperties}
      >
        <CurrentShuttleVoicePicker
          players={voicePlayers}
          initiallySelectedIds={summary.entries.map((entry) => entry.playerId)}
          disabled={!canManageSession || isFull}
          maxSelections={Math.max(0, 4 - summary.count)}
          label="เลือกคนลงลูกด้วยเสียง"
          onSelectPlayer={onTogglePlayer}
        />
        <Box className="playerPickerGrid" aria-label="รายชื่อสำหรับติ๊กลูก">
          {players.length === 0 ? (
            <Box className="emptyPlayerPicker">
              {hasSearch
                ? "ไม่พบชื่อที่ค้นหา"
                : allPlayerCount === 0
                  ? "เพิ่มชื่อผู้เล่นเพื่อเริ่มเลือกคน"
                  : "ไม่มีผู้เล่นค้างจ่าย"}
            </Box>
          ) : enableAlphabetGrouping ? (
            <Box className="playerPickerGroupedList">
              {groupedPlayers.length > 1 ? (
                <Stack
                  className="playerPickerIndexBar"
                  role="navigation"
                  aria-label="ดัชนีรายชื่อตามอักษร"
                >
                  {groupedPlayers.map((group) => (
                    <Button
                      key={`index-${group.label}`}
                      size="small"
                      variant="outlined"
                      onClick={() => handleJumpToGroup(group.label)}
                      className="playerPickerIndexButton"
                      aria-label={`ไปที่หมวด ${group.label}`}
                    >
                      {group.label}
                    </Button>
                  ))}
                </Stack>
              ) : null}
              <Box className="playerPickerGroups">
                {groupedPlayers.map((group) => (
                  <Box
                    key={group.label}
                    className="playerPickerGroup"
                    ref={(element) => {
                      if (element) {
                        groupRefs.current[group.label] = element as HTMLElement;
                      } else {
                        delete groupRefs.current[group.label];
                      }
                    }}
                  >
                    <Typography className="playerPickerGroupLabel" component="h3">
                      หมวด {group.label}
                    </Typography>
                    <Box className="playerPickerGrid">
                      {group.players.map((player, index) => {
                        const selectedCount = getPlayerShuttleMarks(player).filter(
                          (mark) => mark === activeShuttleNumber
                        ).length;
                        const waitClass = getWaitingRowClass(player, now);
                        return (
                          <Button
                            key={player.id}
                            className={`playerPickerButton ${waitClass}${selectedCount > 0 ? " playerPickerButtonSelected" : ""
                              }`}
                            variant={selectedCount > 0 ? "contained" : "outlined"}
                            disabled={!canManageSession || (isFull && selectedCount === 0)}
                            onClick={() => onTogglePlayer(player.id)}
                            aria-label={`เลือก ${player.name} ลงลูก ${activeShuttleNumber}`}
                          >
                            <span className="playerPickerOrder">{index + 1}</span>
                            <span className="playerPickerName">{player.name}</span>
                            {selectedCount > 0 ? (
                              <span className="playerPickerCount">x{selectedCount}</span>
                            ) : null}
                          </Button>
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : (
            players.map((player, index) => {
              const selectedCount = getPlayerShuttleMarks(player).filter(
                (mark) => mark === activeShuttleNumber
              ).length;
              const waitClass = getWaitingRowClass(player, now);
              return (
                <Button
                  key={player.id}
                  className={`playerPickerButton ${waitClass}${selectedCount > 0 ? " playerPickerButtonSelected" : ""
                    }`}
                  variant={selectedCount > 0 ? "contained" : "outlined"}
                  disabled={!canManageSession || (isFull && selectedCount === 0)}
                  onClick={() => onTogglePlayer(player.id)}
                  aria-label={`เลือก ${player.name} ลงลูก ${activeShuttleNumber}`}
                >
                  <span className="playerPickerOrder">{index + 1}</span>
                  <span className="playerPickerName">{player.name}</span>
                  {selectedCount > 0 ? (
                    <span className="playerPickerCount">x{selectedCount}</span>
                  ) : null}
                </Button>
              );
            })
          )}
        </Box>
      </Paper>
    </>
  );
}

function CurrentShuttleVoicePicker({
  players,
  initiallySelectedIds,
  disabled,
  maxSelections,
  label,
  onSelectPlayer
}: {
  players: Player[];
  initiallySelectedIds: string[];
  disabled: boolean;
  maxSelections: number;
  label: string;
  onSelectPlayer: (id: string) => void;
}) {
  type RecognitionLike = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
  };
  type RecognitionConstructor = new () => RecognitionLike;
  type AmbiguousMatch = Extract<VoicePlayerMatchResult, { status: "ambiguous" }> & { id: string };

  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceSummary, setVoiceSummary] = useState<string[]>([]);
  const [ambiguousMatches, setAmbiguousMatches] = useState<AmbiguousMatch[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const selectionLimitRef = useRef(maxSelections);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  useEffect(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    setSpeechSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => recognitionRef.current?.stop();
  }, []);

  function clearVoiceSelection() {
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Ignored: recognition might already be inactive.
      }
    }
    recognitionRef.current = null;
    setIsListening(false);
    setVoiceMessage("");
    setVoiceSummary([]);
    setAmbiguousMatches([]);
    setSelectedIds([]);
    selectedIdsRef.current = [];
  }

  function startVoiceSelection() {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;

    clearVoiceSelection();
    selectionLimitRef.current = maxSelections;
    const recognition = new Recognition();
    recognition.lang = "th-TH";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      const results = matchSpokenPlayerNames(transcript, players);
      const unavailableIds = new Set([...initiallySelectedIds, ...selectedIds]);
      const matchedPlayers = results
        .filter((result): result is Extract<VoicePlayerMatchResult, { status: "matched" }> =>
          result.status === "matched"
        )
        .map((result) => result.player)
        .filter(
          (player, index, allPlayers) =>
            !unavailableIds.has(player.id) &&
            allPlayers.findIndex((currentPlayer) => currentPlayer.id === player.id) === index
        )
        .slice(0, maxSelections);
      const nextAmbiguousMatches = results
        .filter(
          (result): result is Extract<VoicePlayerMatchResult, { status: "ambiguous" }> =>
            result.status === "ambiguous"
        )
        .map((result, index) => ({
          ...result,
          id: `${index}-${result.spokenText}`
        }));
      const autoSelectedPlayers = matchedPlayers.length === 1 ? matchedPlayers : [];
      const displayedAmbiguousMatches =
        matchedPlayers.length > 1
          ? [
            {
              status: "ambiguous" as const,
              id: `matched-${transcript}`,
              spokenText: transcript,
              candidates: matchedPlayers
            },
            ...nextAmbiguousMatches
          ]
          : nextAmbiguousMatches;

      autoSelectedPlayers.forEach((player) => onSelectPlayer(player.id));
      selectedIdsRef.current = autoSelectedPlayers.map((player) => player.id);
      setSelectedIds(autoSelectedPlayers.map((player) => player.id));
      setAmbiguousMatches(displayedAmbiguousMatches);
      setVoiceSummary([
        ...autoSelectedPlayers.map((player) => `เพิ่มแล้ว: ${player.name}`),
        ...displayedAmbiguousMatches.map((match) => `กรุณาเลือกชื่อใกล้เคียงสำหรับ: ${match.spokenText}`)
      ]);
      setVoiceMessage(`ได้ยิน: ${transcript}`);
    };
    recognition.onerror = (event) => {
      setVoiceMessage(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "ไม่ได้รับสิทธิ์ใช้ไมโครโฟน"
          : "ฟังเสียงไม่สำเร็จ กรุณาลองใหม่"
      );
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setVoiceMessage("กำลังฟัง...");
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setVoiceMessage("เปิดไมโครโฟนไม่สำเร็จ กรุณาลองใหม่");
      setIsListening(false);
      recognitionRef.current = null;
    }
  }

  function chooseCandidate(player: VoicePlayer) {
    if (
      !initiallySelectedIds.includes(player.id) &&
      !selectedIdsRef.current.includes(player.id) &&
      selectedIdsRef.current.length < selectionLimitRef.current
    ) {
      onSelectPlayer(player.id);
      selectedIdsRef.current = [...selectedIdsRef.current, player.id];
      setSelectedIds(selectedIdsRef.current);
      setVoiceSummary((current) => [...current, `เพิ่มแล้ว: ${player.name}`]);
    }
  }

  return (
    <Box mt={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Tooltip
          title={
            speechSupported
              ? isListening
                ? "หยุดการเลือกด้วยเสียง"
                : "แตะแล้วพูดชื่อคนลงลูก"
              : "Browser นี้ไม่รองรับการเลือกด้วยเสียง"
          }
        >
          <span>
            <IconButton
              aria-label={
                isListening
                  ? "หยุดเลือกคนลงลูกด้วยเสียง"
                  : "เลือกคนลงลูกด้วยเสียง"
              }
              color={isListening ? "secondary" : "primary"}
              disabled={!speechSupported || disabled}
              onClick={isListening ? clearVoiceSelection : startVoiceSelection}
            >
              <MicIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Typography fontSize={14} color="text.secondary">{label}</Typography>
      </Stack>
      {voiceMessage || voiceSummary.length > 0 || ambiguousMatches.length > 0 ? (
        <Box mt={0.5}>
          <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1}>
            <Box>
              <Typography fontSize={14} color={voiceMessage.includes("ไม่") ? "error" : "text.secondary"}>
                {voiceMessage}
              </Typography>
              {voiceSummary.map((message, index) => (
                <Typography key={`${message}-${index}`} fontSize={14}>
                  {index + 1}. {message}
                </Typography>
              ))}
            </Box>
            <IconButton aria-label="ปิดรายการเสียงลงลูก" size="small" onClick={clearVoiceSelection}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          {ambiguousMatches.map((match) => (
            <Box key={match.id} mt={1}>
              <Typography fontSize={14}>เลือกชื่อที่ได้ยินว่า “{match.spokenText}”</Typography>
              <Stack direction="row" spacing={1} mt={0.5} flexWrap="wrap" useFlexGap>
                {match.candidates.map((player) => (
                  <Button
                    key={`${match.id}-${player.id}`}
                    size="small"
                    variant="outlined"
                    disabled={
                      initiallySelectedIds.includes(player.id) ||
                      selectedIds.includes(player.id) ||
                      selectedIds.length >= selectionLimitRef.current
                    }
                    onClick={() => chooseCandidate(player)}
                  >
                    {player.name}
                  </Button>
                ))}
              </Stack>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function PriorityPlayers({ players, now }: { players: Player[]; now: string }) {
  if (players.length === 0) {
    return null;
  }

  return (
    <Box className="priorityPanel" role="region" aria-label="คนที่ควรได้ลงก่อน">
      <Typography fontWeight={800}>ควรจัดก่อน</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {players.map((player) => (
          <Chip
            key={player.id}
            label={player.name}
            color={getPlayerWaitStatus(player, now) === "danger" ? "error" : "warning"}
            variant="outlined"
          />
        ))}
      </Stack>
    </Box>
  );
}

function PlannedMatchPanel({
  plannedMatches,
  selectedMatchId,
  activePlayers,
  availablePlayers,
  plannedPlayerIds,
  playerSortMode,
  onPlayerSortModeChange,
  currentShuttleNumber,
  canManageSession,
  now,
  onSelectMatch,
  onAddPlayer,
  onRemovePlayer,
  onCancelMatch,
  onConfirmMatch
}: {
  plannedMatches: PlannedMatch[];
  selectedMatchId: string;
  activePlayers: Player[];
  availablePlayers: Player[];
  plannedPlayerIds: ReadonlySet<string>;
  playerSortMode: "queue" | "alphabetical";
  onPlayerSortModeChange: (sortMode: "queue" | "alphabetical") => void;
  currentShuttleNumber: number;
  canManageSession: boolean;
  now: string;
  onSelectMatch: (id: string) => void;
  onAddPlayer: (id: string) => void;
  onRemovePlayer: (matchId: string, playerId: string) => void;
  onCancelMatch: (matchId: string) => void;
  onConfirmMatch: (matchId: string) => void;
}) {
  const playerById = useMemo(
    () => new Map(activePlayers.map((player) => [player.id, player])),
    [activePlayers]
  );
  const selectedMatch = plannedMatches.find((match) => match.id === selectedMatchId);
  const selectedMatchFull = (selectedMatch?.playerIds.length ?? 0) >= 4;
  const enableAlphabetGrouping = playerSortMode === "alphabetical";
  const sortedPlannedMatches = useMemo(() => {
    return [...plannedMatches].sort((a, b) => {
      if (a.confirmed && !b.confirmed) return 1;
      if (!a.confirmed && b.confirmed) return -1;
      return 0;
    });
  }, [plannedMatches]);

  const playerGroups = useMemo(() => {
    const nowDate = new Date(now);
    const restUntil = (player: Player) => player.restUntil ? new Date(player.restUntil) : null;
    const isResting = (player: Player) => {
      const restEnd = restUntil(player);
      return restEnd && nowDate < restEnd;
    };
    const orderedPlayers = playerSortMode === "alphabetical"
      ? [...availablePlayers].sort((first, second) =>
        first.name.localeCompare(second.name, "th-TH", { sensitivity: "base" })
      )
      : availablePlayers;

    return {
      danger: orderedPlayers.filter(p => getPlayerWaitStatus(p, now) === "danger"),
      warning: orderedPlayers.filter(p => getPlayerWaitStatus(p, now) === "warning"),
      normal: orderedPlayers.filter(p => getPlayerWaitStatus(p, now) === "normal" && !isResting(p)),
      resting: orderedPlayers.filter(p => isResting(p))
    };
  }, [availablePlayers, now, playerSortMode]);
  const alphabetPlayerGroups = useMemo(() => {
    const groups: Array<{ label: string; players: Player[] }> = [];
    const orderedPlayers = [...availablePlayers].sort((first, second) =>
      first.name.localeCompare(second.name, "th-TH", { sensitivity: "base" })
    );
    orderedPlayers.forEach((player) => {
      const label = getPlayerInitialGroupLabel(player.name);
      const existingGroup = groups.find((group) => group.label === label);
      if (existingGroup) {
        existingGroup.players.push(player);
      } else {
        groups.push({ label, players: [player] });
      }
    });
    return groups;
  }, [availablePlayers]);
  const plannedGroupRefs = useRef<Record<string, HTMLElement | null>>({});
  const handleJumpToPlannedGroup = useCallback((label: string) => {
    const target = plannedGroupRefs.current[label];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);
  const renderPlannedPlayerButton = (player: Player, className = "plannedPlayerButton") => {
    const isAlreadyPlanned = plannedPlayerIds.has(player.id);

    return (
      <Button
        key={player.id}
        className={`${className}${isAlreadyPlanned ? " plannedPlayerButtonDisabled" : ""}`}
        variant="outlined"
        disabled={!canManageSession || !selectedMatch || selectedMatchFull || isAlreadyPlanned}
        onClick={() => onAddPlayer(player.id)}
      >
        <span className="playerPickerName">{player.name}</span>
      </Button>
    );
  };

  return (
    <Box
      className={`plannedMatchPanel${enableAlphabetGrouping ? " plannedMatchPanelAlphabet" : ""}`}
      role="region"
      aria-label="จัด Match ล่วงหน้า"
    >
      <Box className="plannedMatchColumn">
        <Box>
          <Typography variant="h5" component="h2">
            Match ที่จัดไว้
          </Typography>
          <Typography color="text.secondary">
            ยืนยันแล้วจะลงเป็นลูกที่ {currentShuttleNumber}
          </Typography>
        </Box>
        <Stack spacing={1.25}>
          {sortedPlannedMatches.map((match) => {
            const isSelected = match.id === selectedMatchId;
            const players = match.playerIds
              .map((playerId) => playerById.get(playerId))
              .filter((player): player is Player => Boolean(player));
            const isReady = players.length === 4;
            return (
              <Paper
                key={match.id}
                className={`plannedMatchCard${isSelected ? " plannedMatchCardSelected" : ""}`}
                elevation={0}
              >
                <Button
                  className="plannedMatchSelectButton"
                  onClick={() => onSelectMatch(match.id)}
                  disabled={!canManageSession}
                  fullWidth
                >
                  <span className="plannedMatchLabel">
                    {isSelected ? <CheckCircleIcon fontSize="small" /> : null}
                    {match.label}
                  </span>
                  <Chip
                    label={`${players.length}/4`}
                    size="small"
                    color={isReady ? "primary" : "default"}
                    variant={isReady ? "filled" : "outlined"}
                  />
                </Button>
                <Box className="plannedMatchNames">
                  {players.length === 0 ? (
                    <Typography color="text.secondary" fontSize={14}>
                      ยังไม่ได้เลือกคน
                    </Typography>
                  ) : (
                    players.map((player, index) => (
                      <Chip
                        key={`${match.id}-${player.id}`}
                        label={
                          <span className="plannedMatchNameChip">
                            {index + 1}. {player.name}
                          </span>
                        }
                        color="primary"
                        variant={isSelected ? "filled" : "outlined"}
                        onDelete={
                          canManageSession
                            ? () => onRemovePlayer(match.id, player.id)
                            : undefined
                        }
                      />
                    ))
                  )}
                </Box>
                <Stack direction="row" spacing={1} className="plannedMatchActions">
                  <Button
                    variant="contained"
                    disabled={!canManageSession || !isReady}
                    onClick={() => onConfirmMatch(match.id)}
                  >
                    ยืนยัน
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    disabled={!canManageSession || players.length === 0}
                    onClick={() => onCancelMatch(match.id)}
                  >
                    ยกเลิก
                  </Button>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Box>
      <Box className="plannedMatchColumn">
        <Box>
          <Typography variant="h5" component="h2">
            รายชื่อที่เลือกได้
          </Typography>
          <Typography color="text.secondary">
            {selectedMatch
              ? `กำลังจัด ${selectedMatch.label}${selectedMatchFull ? " ครบแล้ว" : ""}`
              : "เลือก Match ก่อน แล้วค่อยกดชื่อ"}
          </Typography>
          <ToggleButtonGroup
            value={playerSortMode}
            exclusive
            onChange={(_, nextValue: "queue" | "alphabetical" | null) => {
              if (nextValue) {
                onPlayerSortModeChange(nextValue);
              }
            }}
            size="small"
            aria-label="ตัวเลือกการเรียงรายชื่อสำหรับ Match ล่วงหน้า"
            sx={{ mt: 1 }}
          >
            <ToggleButton value="queue" aria-label="เรียงรายชื่อ Match ล่วงหน้าตามคิว">
              ตามคิว
            </ToggleButton>
            <ToggleButton value="alphabetical" aria-label="เรียงรายชื่อ Match ล่วงหน้าตามอักษร">
              ก-ฮ
            </ToggleButton>
          </ToggleButtonGroup>
          <CurrentShuttleVoicePicker
            players={availablePlayers.filter((player) => !plannedPlayerIds.has(player.id))}
            initiallySelectedIds={[]}
            disabled={!canManageSession || !selectedMatch || selectedMatchFull}
            maxSelections={Math.max(0, 4 - (selectedMatch?.playerIds.length ?? 0))}
            label="เลือกผู้เล่นด้วยเสียง"
            onSelectPlayer={onAddPlayer}
          />
        </Box>
        <Box>
          {availablePlayers.length === 0 ? (
            <Box className="emptyPlayerPicker">
              {activePlayers.length === 0
                ? "ยังไม่มีผู้เล่นกำลังตี"
                : "ยังไม่มีรายชื่อให้เลือก"}
            </Box>
          ) : (
            <>
              {enableAlphabetGrouping ? (
                <Box className="plannedPlayerGroupedList">
                  <Box className="plannedPlayerGroups">
                    {alphabetPlayerGroups.map((group) => (
                      <Box
                        key={group.label}
                        className="plannedPlayerAlphabetGroup"
                        ref={(element) => {
                          if (element) {
                            plannedGroupRefs.current[group.label] = element as HTMLElement;
                          } else {
                            delete plannedGroupRefs.current[group.label];
                          }
                        }}
                      >
                        <Typography className="playerPickerGroupLabel" component="h3">
                          หมวด {group.label}
                        </Typography>
                        <Box className="plannedPlayerGrid">
                          {group.players.map((player) => {
                            const waitStatus = getPlayerWaitStatus(player, now);
                            const waitClass =
                              waitStatus === "danger"
                                ? "plannedPlayerButton plannedPlayerButtonDanger"
                                : waitStatus === "warning"
                                  ? "plannedPlayerButton plannedPlayerButtonWarning"
                                  : "plannedPlayerButton";
                            return renderPlannedPlayerButton(player, waitClass);
                          })}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                  {alphabetPlayerGroups.length > 1 ? (
                    <Stack
                      className="plannedPlayerIndexBar"
                      role="navigation"
                      aria-label="ดัชนีรายชื่อ Match ล่วงหน้าตามอักษร"
                    >
                      {alphabetPlayerGroups.map((group) => (
                        <Button
                          key={`planned-index-${group.label}`}
                          size="small"
                          variant="outlined"
                          onClick={() => handleJumpToPlannedGroup(group.label)}
                          className="playerPickerIndexButton"
                          aria-label={`ไปที่หมวด Match ${group.label}`}
                        >
                          {group.label}
                        </Button>
                      ))}
                    </Stack>
                  ) : null}
                </Box>
              ) : (
                <>
                  {playerGroups.danger.length > 0 && (
                    <Box className="plannedPlayerSection">
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        วิกฤต (หลังลงล่าสุด 55 นาทีขึ้นไป) ({playerGroups.danger.length})
                      </Typography>
                      <Box className="plannedPlayerGrid">
                        {playerGroups.danger.map((player) =>
                          renderPlannedPlayerButton(
                            player,
                            "plannedPlayerButton plannedPlayerButtonDanger"
                          )
                        )}
                      </Box>
                    </Box>
                  )}
                  {playerGroups.warning.length > 0 && (
                    <Box className="plannedPlayerSection">
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        เตือน (หลังลงล่าสุด 40-54 นาที) ({playerGroups.warning.length})
                      </Typography>
                      <Box className="plannedPlayerGrid">
                        {playerGroups.warning.map((player) =>
                          renderPlannedPlayerButton(
                            player,
                            "plannedPlayerButton plannedPlayerButtonWarning"
                          )
                        )}
                      </Box>
                    </Box>
                  )}
                  {playerGroups.normal.length > 0 && (
                    <Box className="plannedPlayerSection">
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        ปกติ (หลังลงล่าสุด 20-39 นาที) ({playerGroups.normal.length})
                      </Typography>
                      <Box className="plannedPlayerGrid">
                        {playerGroups.normal.map((player) => renderPlannedPlayerButton(player))}
                      </Box>
                    </Box>
                  )}
                  {playerGroups.resting.length > 0 && (
                    <Box className="plannedPlayerSection">
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        พัก/เพิ่งตี (หลังลงล่าสุดไม่ถึง 20 นาที) ({playerGroups.resting.length})
                      </Typography>
                      <Box className="plannedPlayerGrid">
                        {playerGroups.resting.map((player) => renderPlannedPlayerButton(player))}
                      </Box>
                    </Box>
                  )}
                </>
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function MatchSummaryPanel({
  matchGroups,
  searchTerm,
  targetShuttleNumber,
  targetShuttleMarkCount,
  onSearchTermChange,
  onAddMatchToNextShuttle,
  canManageSession
}: {
  matchGroups: ReturnType<typeof groupMatchesByShuttle>;
  searchTerm: string;
  targetShuttleNumber: number;
  targetShuttleMarkCount: number;
  onSearchTermChange: (value: string) => void;
  onAddMatchToNextShuttle: (shuttleNumber: number) => void;
  canManageSession: boolean;
}) {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("th-TH");
  const visibleMatchGroups = normalizedSearch
    ? matchGroups.filter((group) =>
      group.playerNames.some((name) =>
        name.toLocaleLowerCase("th-TH").includes(normalizedSearch)
      )
    )
    : matchGroups;

  return (
    <Box className="matchSummaryPanel" role="region" aria-label="รายการ Match">
      <Box className="matchSummaryHeader">
        <Box>
          <Typography variant="h5" component="h2">
            Match
          </Typography>
          {targetShuttleMarkCount > 0 ? (
            <Typography className="matchAddGuardText" color="warning.main">
              ลูกที่ {targetShuttleNumber} มี {targetShuttleMarkCount} ติ๊กแล้ว เคลียร์ก่อนถึงจะเพิ่มลูกได้
            </Typography>
          ) : null}
        </Box>
        <TextField
          label="ค้นหา Match"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          className="matchSearchField"
          autoComplete="off"
        />
      </Box>
      {visibleMatchGroups.length === 0 ? (
        <Box className="emptyPaidSummary">
          {normalizedSearch ? "ไม่พบชื่อใน Match" : "ยังไม่มีรายการ Match"}
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {visibleMatchGroups.map((group) => (
            <Paper
              key={group.shuttleNumber}
              className={`matchItem${group.isOverLimit ? " matchItemDanger" : ""}${group.isIncomplete ? " matchItemWarning" : ""}${group.source === 'batch' ? " matchItemBatch" : ""
                }`}
              elevation={0}
            >
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box flex={1}>
                   <Box sx={{ flexDirection: 'row' }}>
                  <Typography variant="h6" component="h3">
                    ลูกที่ {group.shuttleNumber}
                      {group.startedAt ? (
                    <span className="matchStartTime" color="text.secondary">
                     :  เริ่ม {formatMatchStartTime(group.startedAt)}
                    </span>
                  ) : null}
                  </Typography>
                
                  </Box>
                  <Typography className="matchNames">
                    {group.playerNames.map((name, index) => (
                      <span key={`${group.shuttleNumber}-${name}-${index}`}>
                        {index > 0 ? ", " : ""}
                        <span className="matchNamePill">{name}</span>
                      </span>
                    ))}
                    {group.isOverLimit ? ` (${group.playerNames.length}/4 เกิน)` : ""}
                    {group.isIncomplete ? ` (${group.playerNames.length}/4 ยังไม่ครบ)` : ""}
                  </Typography>
                </Box>
                {!group.isOverLimit && !group.isIncomplete && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => onAddMatchToNextShuttle(group.shuttleNumber)}
                    disabled={!canManageSession || targetShuttleMarkCount > 0}
                    sx={{ ml: 1, minWidth: 'auto' }}
                  >
                    เพิ่มลูก
                  </Button>
                )}
              </Box>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function PaidSummary({
  players,
  paidGroups,
  hasSearch,
  onSetPaid,
  canSetPaid
}: {
  players: Player[];
  paidGroups: ReturnType<typeof groupPaidPlayersByDay>;
  hasSearch: boolean;
  onSetPaid: (id: string, paid: boolean) => void;
  canSetPaid: boolean;
}) {
  return (
    <Box className="paidSummaryPanel" role="region" aria-label="รายการจ่ายแล้ว">
      <Box className="paidSummaryHeader">
        <Typography variant="h5" component="h2">
          สรุปจ่ายแล้ว
        </Typography>
      </Box>
      {paidGroups.length === 0 ? (
        <Box className="emptyPaidSummary">
          {hasSearch ? "ไม่พบชื่อที่ค้นหา" : "ยังไม่มีคนจ่ายเงินในรอบนี้"}
        </Box>
      ) : (
        <Stack spacing={2}>
          {paidGroups.map((group) => (
            <Paper key={group.dateKey} className="paidDayGroup" elevation={0}>
              <Box className="paidDayHeader">
                <Typography variant="h6" component="h3">
                  {formatDateKey(group.dateKey)}
                </Typography>
                <Typography fontWeight={800}>{formatBaht(group.totalAmount)} บาท</Typography>
              </Box>
              <Stack divider={<Divider />} className="paidPlayerList">
                {group.players.map((paidPlayer) => {
                  const sourcePlayer = players.find(
                    (player) =>
                      player.paid &&
                      player.name === paidPlayer.name &&
                      player.shuttleCount === paidPlayer.shuttleCount
                  );
                  const paidAccount = getPaymentAccount(paidPlayer.paidAccountId);
                  const discount = paidPlayer.calculatedAmount - paidPlayer.amount;
                  const hasDiscount = discount > 0;
                  const hasOverpay = discount < 0;

                  return (
                    <Box key={`${group.dateKey}-${paidPlayer.name}`} className="paidPlayerItem">
                      <Box>
                         {paidPlayer.paidAt ? (
                          <Typography className="paidPlayerTime" color="text.secondary">
                            เวลา {formatMatchStartTime(paidPlayer.paidAt)}
                          </Typography>
                        ) : null}
                        <Typography fontWeight={800}>{paidPlayer.name}</Typography>
                        <Typography color="text.secondary">{paidPlayer.shuttleCount} ลูก</Typography>
                        <Box className="paidPlayerPaymentAccount">
                          <Box
                            component="img"
                            src={paidAccount.logoSrc}
                            alt=""
                            aria-hidden="true"
                            className="paidPlayerPaymentLogo"
                          />
                          <Typography variant="caption">
                            {paidAccount.label}
                          </Typography>
                        </Box>
                      </Box>
                      <Stack direction="row" spacing={1.5} alignItems="flex-start" className="paidPlayerRight">
                        <Box className="paidPlayerAmounts">
                          <Typography className="paidPlayerAmountMain">
                            {formatBaht(paidPlayer.amount)} บาท
                          </Typography>
                          <Typography className="paidPlayerAmountMeta">
                            ยอดจริง {formatBaht(paidPlayer.calculatedAmount)} บาท
                          </Typography>
                          {hasDiscount ? (
                            <Typography className="paidPlayerAmountMeta paidPlayerDiscount">
                              ลดให้ {formatBaht(discount)} บาท
                            </Typography>
                          ) : null}
                          {hasOverpay ? (
                            <Typography className="paidPlayerAmountMeta paidPlayerOverpay">
                              จ่ายเพิ่ม {formatBaht(Math.abs(discount))} บาท
                            </Typography>
                          ) : null}
                        </Box>
                        {sourcePlayer ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => onSetPaid(sourcePlayer.id, false)}
                            disabled={!canSetPaid}
                          >
                            ย้ายกลับ
                          </Button>
                        ) : null}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function DataManagementPanel({
  onClearPlayData,
  onResetSession,
  onCopySummary,
  onFinishSession,
  selectedPaymentAccountId,
  onPaymentAccountChange,
  sessionClosed,
  canFinishSession,
  matchSetupMode,
  onToggleMatchSetupMode,
  canManageSession
}: {
  onClearPlayData: () => void;
  onResetSession: () => void;
  onCopySummary: () => void;
  onFinishSession: () => void;
  selectedPaymentAccountId: PaymentAccountId;
  onPaymentAccountChange: (accountId: PaymentAccountId) => void;
  sessionClosed: boolean;
  canFinishSession: boolean;
  matchSetupMode: boolean;
  onToggleMatchSetupMode: () => void;
  canManageSession: boolean;
}) {
  return (
    <Box className="dataManagementPanel" role="region" aria-label="จัดการข้อมูล">
      <Box>
        <Typography variant="h5" component="h2">
          จัดการข้อมูล
        </Typography>
        <Typography color="text.secondary">
          รวมเครื่องมือ export และจัดการข้อมูลรอบนี้
        </Typography>
      </Box>
      <Box className="paymentAccountSettings">
        <Typography fontWeight={800}>บัญชีรับเงิน QR</Typography>
        <ToggleButtonGroup
          exclusive
          value={selectedPaymentAccountId}
          onChange={(_, value) => {
            if (value) {
              onPaymentAccountChange(normalizePaymentAccountId(value));
            }
          }}
          aria-label="เลือกบัญชีรับเงิน QR"
          className="paymentAccountToggle"
        >
          {PAYMENT_ACCOUNTS.map((account) => (
            <ToggleButton
              key={account.id}
              value={account.id}
              aria-label={`${account.label} PromptPay ${account.promptPayDisplay}`}
              className="paymentAccountOption"
            >
              <Box
                component="img"
                src={account.logoSrc}
                alt=""
                aria-hidden="true"
                className="paymentAccountLogo"
              />
              <Box>
                <Typography fontWeight={800}>{account.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  PromptPay {account.promptPayDisplay}
                </Typography>
              </Box>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} className="dataManagementActions">
        {matchSetupMode ? (
          <Button color="secondary" variant="contained" onClick={onToggleMatchSetupMode}>
            ออกจากโหมดจัด Match
          </Button>
        ) : null}
        <Button variant="contained" onClick={onCopySummary} disabled={!canManageSession}>
          Export สรุป
        </Button>
        <Button color="secondary" variant="outlined" onClick={onClearPlayData} disabled={!canManageSession}>
          ล้างข้อมูลเล่น
        </Button>
        <Button
          color="secondary"
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={onResetSession}
          disabled={!canManageSession}
        >
          รีเซ็ตรอบ
        </Button>
        <Button
          color="warning"
          variant="outlined"
          startIcon={<CheckCircleIcon />}
          onClick={onFinishSession}
          disabled={!canFinishSession || sessionClosed}
        >
          {sessionClosed ? "จบรอบแล้ว" : "จบรอบ"}
        </Button>
      </Stack>
    </Box>
  );
}

function SummaryStat({
  label,
  value,
  note,
  tone
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "danger";
}) {
  return (
    <Paper className={`summaryStat${tone === "danger" ? " summaryStatDanger" : ""}`} elevation={0}>
      <Chip label={label} size="small" />
      <Typography variant="h6" component="p">
        {value}
      </Typography>
      {note ? (
        <Typography className="summaryNote" component="p">
          {note}
        </Typography>
      ) : null}
    </Paper>
  );
}

function formatBaht(value: number): string {
  return bahtFormatter.format(value);
}

function formatDateKey(dateKey: string): string {
  return dateFormatter.format(new Date(`${dateKey}T00:00:00`));
}

function formatMatchStartTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return matchTimeFormatter.format(date);
}

function formatRelativeTime(createdAt: string, nowValue: string): string {
  const created = new Date(createdAt).getTime();
  const now = new Date(nowValue).getTime();
  if (Number.isNaN(created) || Number.isNaN(now)) {
    return "";
  }
  const diffMinutes = Math.max(0, Math.floor((now - created) / 60000));
  if (diffMinutes <= 0) {
    return "เมื่อกี้";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} นาทีที่แล้ว`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} ชั่วโมงที่แล้ว`;
}

function addMinutes(value: string, minutes: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(Date.now() + minutes * 60000).toISOString();
  }
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

function getInitialSessionId(): string {
  if (typeof window === "undefined") {
    return "main";
  }

  const params = new URLSearchParams(window.location.search);
  return normalizeSessionId(
    params.get("room") ?? localStorage.getItem("badminton-fee-book.room") ?? "main"
  );
}

function normalizeSessionId(value: string): string {
  return value.trim().replace(/\s+/g, "-").toLowerCase() || "main";
}

function persistSessionId(sessionId: string) {
  localStorage.setItem("badminton-fee-book.room", sessionId);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("room", sessionId);
  window.history.replaceState(null, "", nextUrl.toString());
}

function getStorageKey(sessionId: string): string {
  return `badminton-fee-book.session.${sessionId}`;
}

function getPendingSyncKey(sessionId: string): string {
  return `badminton-fee-book.pending-sync.${sessionId}`;
}

function serializeSession(session: SessionState): string {
  return JSON.stringify(normalizeSession(session));
}

function persistLocalSnapshot(sessionId: string, snapshot: string) {
  localStorage.setItem(getStorageKey(sessionId), snapshot);
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function formatFileTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function parseSessionSnapshot(snapshot: string, fallback: SessionState): SessionState {
  try {
    return normalizeSession(JSON.parse(snapshot));
  } catch {
    return normalizeSession(fallback);
  }
}

function isSessionNewerThan(candidate: SessionState, current: SessionState): boolean {
  const candidateTime = new Date(candidate.updatedAt).getTime();
  const currentTime = new Date(current.updatedAt).getTime();
  if (Number.isNaN(candidateTime)) {
    return false;
  }
  if (Number.isNaN(currentTime)) {
    return true;
  }
  return candidateTime > currentTime;
}

function loadAuthSession(): AuthSession | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!storedAuth) {
      return null;
    }
    const parsedAuth = JSON.parse(storedAuth) as Partial<AuthSession>;
    return parsedAuth.role === "admin" || parsedAuth.role === "admin2"
      ? { role: parsedAuth.role }
      : null;
  } catch {
    return null;
  }
}

function loadLocalSession(sessionId: string): SessionState {
  const stored = localStorage.getItem(getStorageKey(sessionId));
  if (!stored) {
    return createInitialSession();
  }

  try {
    return normalizeSession(JSON.parse(stored));
  } catch {
    return createInitialSession();
  }
}
