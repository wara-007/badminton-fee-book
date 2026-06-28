"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Collapse,
  Container,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography
} from "@mui/material";
import { getAppTheme } from "@/lib/theme";
import { useThemeMode } from "@/lib/theme-context";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LightModeIcon from "@mui/icons-material/LightMode";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";
import VisibilityIcon from "@mui/icons-material/Visibility";
import LogoutIcon from "@mui/icons-material/Logout";
import {
  createInitialSession,
  getPlayerPaymentAmount,
  normalizeSession,
  SessionState,
  summarizeSession
} from "@/lib/session";
import {
  PAYMENT_ACCOUNTS,
  createEmptyReceivedByAccount,
  getPaymentAccount,
  normalizeReceivedByAccount,
  normalizePaymentAccountId
} from "@/lib/payment-accounts";
import {
  deleteRemoteSession,
  hasSupabaseConfig,
  listRoomDashboardSnapshots,
  loadRemoteSession,
  listRemoteSessions,
  RoomDashboardSnapshot,
  saveRemoteSession,
  upsertRoomDashboardSnapshot
} from "@/lib/supabase-session";

const AUTH_STORAGE_KEY = "badminton-fee-book.auth";
const ROOM_STORAGE_KEY = "badminton-fee-book.room";
const SESSION_PREFIX = "badminton-fee-book.session.";
const DASHBOARD_SNAPSHOTS_KEY = "badminton-fee-book.dashboard-snapshots";
const PROJECT_NAME = "สมุดค่าตีแบด";
const SUMMARY_THRESHOLD_MS = 12 * 60 * 60 * 1000;
const bahtFormatter = new Intl.NumberFormat("th-TH");

type AuthSession = {
  role: string;
};

type RoomSummary = RoomDashboardSnapshot;

function normalizeSessionId(value: string): string {
  return value.trim().replace(/\s+/g, "-").toLowerCase() || "main";
}

function getStorageKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

function getAllRoomIds(): string[] {
  if (typeof window === "undefined") return [];
  const rooms = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SESSION_PREFIX)) {
      rooms.add(key.replace(SESSION_PREFIX, ""));
    }
  }
  const current = localStorage.getItem(ROOM_STORAGE_KEY);
  if (current) rooms.add(current);
  return Array.from(rooms).sort();
}

function loadLocalRoomSession(roomId: string): SessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getStorageKey(roomId));
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function loadDashboardSnapshots(): RoomSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DASHBOARD_SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((snapshot): RoomSummary | null => {
        if (!snapshot || typeof snapshot !== "object") return null;
        const candidate = snapshot as Partial<RoomSummary>;
        if (
          typeof candidate.roomId !== "string" ||
          typeof candidate.startedAt !== "string"
        ) {
          return null;
        }
        return {
          roomId: candidate.roomId,
          startedAt: candidate.startedAt,
          capturedAt:
            typeof candidate.capturedAt === "string"
              ? candidate.capturedAt
              : new Date().toISOString(),
          peopleCount: Number(candidate.peopleCount) || 0,
          customerCount: Number(candidate.customerCount) || 0,
          shuttleCount: Number(candidate.shuttleCount) || 0,
          receivedAmount: Number(candidate.receivedAmount) || 0,
          receivedByAccount: normalizeReceivedByAccount(
            candidate.receivedByAccount,
            Number(candidate.receivedAmount) || 0
          ),
          joinedByHour: normalizeHourlyCounts(candidate.joinedByHour),
          paidByHour: normalizeHourlyCounts(candidate.paidByHour)
        };
      })
      .filter((snapshot): snapshot is RoomSummary => Boolean(snapshot));
  } catch {
    return [];
  }
}

function saveDashboardSnapshots(snapshots: RoomSummary[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DASHBOARD_SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

function isMissingSupabaseRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "PGRST202" ||
    candidate.message?.includes("Could not find the function") === true
  );
}

async function loadPersistedDashboardSnapshots(): Promise<RoomSummary[]> {
  if (hasSupabaseConfig) {
    try {
      return await listRoomDashboardSnapshots();
    } catch (error) {
      if (!isMissingSupabaseRpcError(error)) {
        console.warn("Failed to load dashboard snapshots from Supabase", error);
      }
      return loadDashboardSnapshots();
    }
  }
  return loadDashboardSnapshots();
}

async function persistDashboardSnapshot(summary: RoomSummary): Promise<RoomSummary> {
  if (hasSupabaseConfig) {
    try {
      return await upsertRoomDashboardSnapshot(summary);
    } catch (error) {
      if (!isMissingSupabaseRpcError(error)) {
        console.warn("Failed to save dashboard snapshot to Supabase", error);
      }
      return summary;
    }
  }
  return summary;
}

function sortRoomSummaries(summaries: RoomSummary[]): RoomSummary[] {
  return [...summaries].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

function upsertDashboardSnapshot(
  snapshots: Map<string, RoomSummary>,
  summary: RoomSummary | null
) {
  if (!summary) return;
  snapshots.set(summary.roomId, summary);
}

async function persistDashboardSnapshots(snapshots: RoomSummary[]): Promise<RoomSummary[]> {
  if (!hasSupabaseConfig) {
    saveDashboardSnapshots(snapshots);
    return snapshots;
  }

  const persistedSnapshots = await Promise.all(
    snapshots.map((snapshot) => persistDashboardSnapshot(snapshot))
  );
  const sortedSnapshots = sortRoomSummaries(persistedSnapshots);
  saveDashboardSnapshots(sortedSnapshots);
  return sortedSnapshots;
}

function getRoomStartedAt(session: SessionState): string {
  const candidates = [
    session.updatedAt,
    ...session.players.flatMap((player) => [
      player.waitingSince,
      player.paidAt
    ]),
    ...session.activityLog.map((activity) => activity.createdAt)
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (candidates.length === 0) {
    return new Date().toISOString();
  }

  return new Date(Math.min(...candidates.map((date) => date.getTime()))).toISOString();
}

function normalizeHourlyCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([hour, count]) => [
        hour,
        Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0
      ])
      .filter(([hour, count]) => /^\d{2}:00$/.test(String(hour)) && Number(count) > 0)
  );
}

function createHourlyCounts(
  values: Array<string | undefined>
): Record<string, number> {
  return values.reduce<Record<string, number>>((totals, value) => {
    if (!value) return totals;
    const joinedDate = new Date(value);
    if (Number.isNaN(joinedDate.getTime())) return totals;
    const hourKey = `${String(joinedDate.getHours()).padStart(2, "0")}:00`;
    return {
      ...totals,
      [hourKey]: (totals[hourKey] ?? 0) + 1
    };
  }, {});
}

function createRoomSummary(roomId: string, session: SessionState): RoomSummary | null {
  const startedAt = getRoomStartedAt(session);
  const startedTime = new Date(startedAt).getTime();
  if (Number.isNaN(startedTime) || Date.now() - startedTime < SUMMARY_THRESHOLD_MS) {
    return null;
  }

  const summary = summarizeSession(session.players, session.pricing);
  const receivedByAccount = session.players
    .filter((player) => player.paid)
    .reduce((totals, player) => {
      const accountId = normalizePaymentAccountId(player.paidAccountId);
      return {
        ...totals,
        [accountId]: totals[accountId] + getPlayerPaymentAmount(player, session.pricing)
      };
    }, createEmptyReceivedByAccount());

  return {
    roomId,
    startedAt,
    capturedAt: new Date().toISOString(),
    peopleCount: summary.playerCount,
    customerCount: summary.playerCount,
    shuttleCount: summary.shuttleCount,
    receivedAmount: summary.paidAmount,
    receivedByAccount,
    joinedByHour: createHourlyCounts(
      session.players.map((player) => player.joinedAt ?? player.waitingSince)
    ),
    paidByHour: createHourlyCounts(
      session.players.filter((player) => player.paid).map((player) => player.paidAt)
    )
  };
}

function formatBaht(value: number): string {
  return bahtFormatter.format(value);
}

function formatStartedAt(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function getMonthKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    return "ไม่ทราบวัน";
  }
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) {
    return "ไม่ทราบเดือน";
  }
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

function getRoomSortDate(roomId: string): number {
  // ISO format: 2026-05-25
  const isoMatch = roomId.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const date = new Date(
      parseInt(isoMatch[1]),
      parseInt(isoMatch[2]) - 1,
      parseInt(isoMatch[3])
    );
    return date.getTime();
  }

  // Thai format: 28/5/26 or 28/05/2026
  const thaiMatch = roomId.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (thaiMatch) {
    let year = parseInt(thaiMatch[3]);
    if (year < 100) year += 2000;
    const date = new Date(
      year,
      parseInt(thaiMatch[2]) - 1,
      parseInt(thaiMatch[1])
    );
    return date.getTime();
  }

  return 0;
}

function loadAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    return parsed.role === "admin" || parsed.role === "admin2"
      ? { role: parsed.role }
      : null;
  } catch {
    return null;
  }
}

export default function RoomsPage() {
  const router = useRouter();
  const { mode, toggleTheme } = useThemeMode();
  const theme = useMemo(() => getAppTheme(mode), [mode]);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [rooms, setRooms] = useState<string[]>([]);
  const [roomSummaries, setRoomSummaries] = useState<RoomSummary[]>([]);
  const [summaryMonth, setSummaryMonth] = useState("all");
  const summaryMonthInitialized = useRef(false);
  const [summaryDate, setSummaryDate] = useState("");
  const summaryDateInitialized = useRef(false);
  const [summaryDetailsOpen, setSummaryDetailsOpen] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string>("main");
  const [newRoomName, setNewRoomName] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  useEffect(() => {
    const session = loadAuthSession();
    if (!session) {
      setAuthChecked(true);
      router.replace("/");
      return;
    }
    setAuth(session);
    setAuthChecked(true);
    setCurrentRoom(localStorage.getItem(ROOM_STORAGE_KEY) ?? "main");

    async function loadRooms() {
      const localRooms = getAllRoomIds();
      const summaries = new Map(
        (await loadPersistedDashboardSnapshots()).map((summary) => [
          summary.roomId,
          summary
        ])
      );
      localRooms.forEach((roomId) => {
        const session = loadLocalRoomSession(roomId);
        upsertDashboardSnapshot(
          summaries,
          session ? createRoomSummary(roomId, session) : null
        );
      });

      if (hasSupabaseConfig) {
        try {
          const remoteRooms = await listRemoteSessions();
          const remoteIds = remoteRooms.map((row) => row.id);
          const remoteSummaries = await Promise.all(
            remoteIds.map(async (roomId) => {
              try {
                const remote = await loadRemoteSession(roomId);
                return createRoomSummary(roomId, remote.session);
              } catch {
                return null;
              }
            })
          );
          remoteSummaries.forEach((summary) => {
            upsertDashboardSnapshot(summaries, summary);
          });
          const merged = new Set([...localRooms, ...remoteIds]);
          setRooms(Array.from(merged));
        } catch {
          setRooms(localRooms);
        }
      } else {
        setRooms(localRooms);
      }
      const nextSummaries = await persistDashboardSnapshots(
        sortRoomSummaries(Array.from(summaries.values()))
      );
      setRoomSummaries(nextSummaries);
      setLoading(false);
    }

    void loadRooms();
  }, [router]);

  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => {
      if (a === currentRoom) return -1;
      if (b === currentRoom) return 1;
      const dateA = getRoomSortDate(a);
      const dateB = getRoomSortDate(b);
      if (dateA && dateB) {
        return dateB - dateA;
      }
      if (dateA) return -1;
      if (dateB) return 1;
      return a.localeCompare(b);
    });
  }, [rooms, currentRoom]);

  const summaryMonthOptions = useMemo(() => {
    return Array.from(
      new Set(roomSummaries.map((summary) => getMonthKey(summary.startedAt)).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a));
  }, [roomSummaries]);

  useEffect(() => {
    if (summaryMonthOptions.length === 0) return;
    if (!summaryMonthInitialized.current) {
      summaryMonthInitialized.current = true;
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      setSummaryMonth(summaryMonthOptions.includes(currentMonthKey) ? currentMonthKey : summaryMonthOptions[0]);
      return;
    }
    if (summaryMonth === "all" || summaryMonthOptions.includes(summaryMonth)) {
      return;
    }
    setSummaryMonth(summaryMonthOptions[0] ?? "all");
  }, [summaryMonth, summaryMonthOptions]);

  const filteredRoomSummaries = useMemo(() => {
    if (summaryMonth === "all") {
      return roomSummaries;
    }
    return roomSummaries.filter(
      (summary) => getMonthKey(summary.startedAt) === summaryMonth
    );
  }, [roomSummaries, summaryMonth]);

  const summaryDateOptions = useMemo(() => {
    return Array.from(
      new Set(roomSummaries.map((summary) => getDateKey(summary.startedAt)).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a));
  }, [roomSummaries]);

  useEffect(() => {
    if (summaryDateOptions.length === 0) return;
    if (!summaryDateInitialized.current) {
      summaryDateInitialized.current = true;
      const now = new Date();
      const currentDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      setSummaryDate(summaryDateOptions.includes(currentDateKey) ? currentDateKey : summaryDateOptions[0]);
      return;
    }
    if (summaryDate && summaryDateOptions.includes(summaryDate)) {
      return;
    }
    setSummaryDate(summaryDateOptions[0] ?? "");
  }, [summaryDate, summaryDateOptions]);

  const selectedDateSummaries = useMemo(() => {
    if (!summaryDate) return [];
    return roomSummaries.filter((summary) => getDateKey(summary.startedAt) === summaryDate);
  }, [roomSummaries, summaryDate]);

  const attendanceChartRows = useMemo(() => {
    const joinedByHour = selectedDateSummaries.reduce<Record<string, number>>(
      (totals, summary) => {
        Object.entries(summary.joinedByHour ?? {}).forEach(([hour, count]) => {
          totals[hour] = (totals[hour] ?? 0) + count;
        });
        return totals;
      },
      {}
    );
    const paidByHour = selectedDateSummaries.reduce<Record<string, number>>(
      (totals, summary) => {
        Object.entries(summary.paidByHour ?? {}).forEach(([hour, count]) => {
          totals[hour] = (totals[hour] ?? 0) + count;
        });
        return totals;
      },
      {}
    );
    let joinedTotal = 0;
    let paidTotal = 0;
    return Array.from(new Set([...Object.keys(joinedByHour), ...Object.keys(paidByHour)]))
      .sort((firstHour, secondHour) => firstHour.localeCompare(secondHour))
      .map((hour) => {
        const added = joinedByHour[hour] ?? 0;
        const paid = paidByHour[hour] ?? 0;
        joinedTotal += added;
        paidTotal += paid;
        return {
          hour,
          added,
          joinedTotal,
          paid,
          paidTotal,
          remaining: Math.max(0, joinedTotal - paidTotal)
        };
      });
  }, [selectedDateSummaries]);

  const attendanceChartMax = useMemo(() => {
    return Math.max(
      1,
      ...attendanceChartRows.flatMap((row) => [
        row.added,
        row.joinedTotal,
        row.paidTotal,
        row.remaining
      ])
    );
  }, [attendanceChartRows]);

  const dashboardTotals = useMemo(() => {
    return filteredRoomSummaries.reduce(
      (totals, summary) => ({
        peopleCount: totals.peopleCount + summary.peopleCount,
        customerCount: totals.customerCount + summary.customerCount,
        shuttleCount: totals.shuttleCount + summary.shuttleCount,
        receivedAmount: totals.receivedAmount + summary.receivedAmount,
        receivedByAccount: PAYMENT_ACCOUNTS.reduce(
          (accountTotals, account) => ({
            ...accountTotals,
            [account.id]:
              accountTotals[account.id] +
              (summary.receivedByAccount?.[account.id] ?? 0)
          }),
          totals.receivedByAccount
        )
      }),
      {
        peopleCount: 0,
        customerCount: 0,
        shuttleCount: 0,
        receivedAmount: 0,
        receivedByAccount: createEmptyReceivedByAccount()
      }
    );
  }, [filteredRoomSummaries]);

  const chartMaxReceivedAmount = useMemo(() => {
    return Math.max(
      1,
      ...filteredRoomSummaries.map((summary) => summary.receivedAmount)
    );
  }, [filteredRoomSummaries]);

  const chartMaxActivityCount = useMemo(() => {
    return Math.max(
      1,
      ...filteredRoomSummaries.flatMap((summary) => [
        summary.peopleCount,
        summary.shuttleCount
      ])
    );
  }, [filteredRoomSummaries]);

  function handleAddRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeSessionId(newRoomName);
    if (!normalized || normalized === "main") {
      setNewRoomName("");
      return;
    }
    if (!rooms.includes(normalized)) {
      const initialSession = createInitialSession();
      localStorage.setItem(
        getStorageKey(normalized),
        JSON.stringify(initialSession)
      );
      if (hasSupabaseConfig) {
        void saveRemoteSession(normalized, initialSession);
      }
      setRooms((prev) => [...prev, normalized].sort());
    }
    setNewRoomName("");
  }

  function handleViewRoom(roomId: string) {
    localStorage.setItem(ROOM_STORAGE_KEY, roomId);
    router.push(`/?room=${encodeURIComponent(roomId)}`);
  }

  function openDeleteDialog(roomId: string) {
    if (roomId === "main") return;
    setDeletingRoomId(roomId);
    setDeleteDialogOpen(true);
  }

  function closeDeleteDialog() {
    setDeleteDialogOpen(false);
    setDeletingRoomId(null);
    setDeleteSubmitting(false);
  }

  async function confirmDeleteRoom() {
    const roomId = deletingRoomId;
    if (!roomId) return;

    setDeleteSubmitting(true);
    try {
      const localSession = loadLocalRoomSession(roomId);
      const localSummary = localSession
        ? createRoomSummary(roomId, localSession)
        : null;
      if (localSummary) {
        const persistedSummary = await persistDashboardSnapshot(localSummary);
        setRoomSummaries((prev) => {
          const snapshots = new Map(prev.map((summary) => [summary.roomId, summary]));
          upsertDashboardSnapshot(snapshots, persistedSummary);
          const nextSummaries = sortRoomSummaries(Array.from(snapshots.values()));
          if (!hasSupabaseConfig) {
            saveDashboardSnapshots(nextSummaries);
          }
          return nextSummaries;
        });
      }

      if (hasSupabaseConfig) {
        await deleteRemoteSession(roomId);
      }

      localStorage.removeItem(getStorageKey(roomId));
      const storedCurrent = localStorage.getItem(ROOM_STORAGE_KEY);
      if (storedCurrent === roomId) {
        localStorage.setItem(ROOM_STORAGE_KEY, "main");
        setCurrentRoom("main");
      }
      setRooms((prev) => prev.filter((r) => r !== roomId));
      closeDeleteDialog();
    } catch (error) {
      console.error("Failed to delete room", error);
      window.alert("ลบ Room ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    router.replace("/");
  }

  if (!authChecked) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center"
          }}
        >
          <Typography color="text.secondary">กำลังตรวจสอบ...</Typography>
        </Box>
      </ThemeProvider>
    );
  }

  if (!auth) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center"
          }}
        >
          <Stack spacing={1.5} alignItems="center">
            <Typography color="text.secondary">
              กรุณาเข้าสู่ระบบก่อนเลือก Room
            </Typography>
            <Button variant="contained" onClick={() => router.replace("/")}>
              กลับหน้าเข้าสู่ระบบ
            </Button>
          </Stack>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="appShell">
        <Container maxWidth="md">
          <Stack spacing={3}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <SportsTennisIcon color="primary" sx={{ fontSize: 32 }} />
                <Typography variant="h5" fontWeight={800}>
                  เลือก Room
                </Typography>
              </Box>
              <Tooltip title={mode === "dark" ? "สลับไปโหมดสว่าง" : "สลับไปโหมดมืด"}>
                <IconButton onClick={toggleTheme} size="small">
                  {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
                </IconButton>
              </Tooltip>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
              >
                ออกจากระบบ
              </Button>
            </Box>

            <Paper
              elevation={0}
              sx={{
                border: "1px solid var(--border-color)",
                borderRadius: 2,
                p: 2
              }}
            >
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                เพิ่ม Room ใหม่
              </Typography>
              <Box
                component="form"
                onSubmit={handleAddRoom}
                sx={{
                  display: "flex",
                  gap: 1.5,
                  flexWrap: "wrap"
                }}
              >
                <TextField
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="ชื่อ Room"
                  size="small"
                  sx={{ flex: 1, minWidth: 200 }}
                />
                <Button type="submit" variant="contained" disabled={!newRoomName.trim()}>
                  เพิ่ม
                </Button>
              </Box>
            </Paper>

            <Stack spacing={1.5}>
              {loading && (
                <Paper
                  elevation={0}
                  sx={{
                    border: "1px dashed var(--empty-border)",
                    borderRadius: 2,
                    p: 4,
                    textAlign: "center"
                  }}
                >
                  <Typography color="text.secondary">
                    กำลังโหลด Room...
                  </Typography>
                </Paper>
              )}
              {!loading && sortedRooms.length === 0 && (
                <Paper
                  elevation={0}
                  sx={{
                    border: "1px dashed var(--empty-border)",
                    borderRadius: 2,
                    p: 4,
                    textAlign: "center"
                  }}
                >
                  <Typography color="text.secondary">
                    ยังไม่มี Room ให้เพิ่ม Room ใหม่ด้านบน
                  </Typography>
                </Paper>
              )}
              {sortedRooms.map((roomId) => {
                const isCurrent = currentRoom === roomId;
                return (
                  <Paper
                    key={roomId}
                    elevation={0}
                    sx={{
                      border: "1px solid var(--border-color)",
                      borderRadius: 2,
                      p: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 2,
                      background: isCurrent ? "var(--primary-bg)" : "var(--card-bg)"
                    }}
                  >
                    <Box>
                      <Typography fontWeight={700}>
                        {roomId}
                        {isCurrent && (
                          <Typography
                            component="span"
                            color="primary"
                            fontWeight={800}
                            sx={{ ml: 1, fontSize: "0.85rem" }}
                          >
                            (ล่าสุด)
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() => handleViewRoom(roomId)}
                      >
                        เปิด
                      </Button>
                      {roomId !== "main" && (
                        <Tooltip
                          title={
                            hasSupabaseConfig
                              ? "ลบ Room ออกจากฐานข้อมูลและเครื่องนี้"
                              : "ลบ Room"
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => openDeleteDialog(roomId)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Box>
                  </Paper>
                );
              })}
            </Stack>

            <Paper
              elevation={0}
              sx={{
                border: "1px solid var(--border-color)",
                borderRadius: 2,
                p: 2,
                background: "var(--card-bg)"
              }}
            >
              <Stack spacing={2}>
                <Box>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 1.5,
                      alignItems: { xs: "stretch", sm: "flex-start" },
                      flexDirection: { xs: "column", sm: "row" }
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1" fontWeight={800}>
                        สรุปผลรวม: {PROJECT_NAME}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        รวมข้อมูลจาก Room ที่ระบบพบว่าเปิดมาเกิน 24 ชม.
                      </Typography>
                    </Box>
                    <TextField
                      select
                      label="เดือน"
                      value={summaryMonth}
                      onChange={(event) => setSummaryMonth(event.target.value)}
                      size="small"
                      sx={{ minWidth: { xs: "100%", sm: 180 } }}
                    >
                      <MenuItem value="all">ทุกเดือน</MenuItem>
                      {summaryMonthOptions.map((monthKey) => (
                        <MenuItem key={monthKey} value={monthKey}>
                          {formatMonthLabel(monthKey)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                </Box>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "repeat(2, minmax(0, 1fr))",
                      sm: "repeat(3, minmax(0, 1fr))"
                    },
                    gap: 1
                  }}
                >
                  {[
                    { label: "จำนวนคน", value: dashboardTotals.peopleCount, sub: null },
                    {
                      label: "จำนวนลูก",
                      value: `${dashboardTotals.shuttleCount} ลูก`,
                      sub: (() => {
                        const s = dashboardTotals.shuttleCount;
                        const tubes = Math.floor(s / 12);
                        const remaining = s % 12;
                        if (tubes === 0) return null;
                        return remaining > 0 ? `${tubes} หลอด / ${remaining} ลูก` : `${tubes} หลอด`;
                      })()
                    },
                    {
                      label: "ยอดเงินที่รับ",
                      value: `${formatBaht(dashboardTotals.receivedAmount)} บาท`,
                      sub: null
                    }
                  ].map((stat) => (
                    <Box
                      key={stat.label}
                      sx={{
                        border: "1px solid var(--border-color)",
                        borderRadius: 2,
                        p: 1.5,
                        background: "var(--card-bg-alt)"
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {stat.label}
                      </Typography>
                      <Typography fontWeight={800} sx={{ mt: 0.25 }}>
                        {stat.value}
                      </Typography>
                      {stat.sub && (
                        <Typography variant="caption" color="text.secondary" fontWeight={400}>
                          {stat.sub}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>

                <Box
                  sx={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 2,
                    p: 1.5,
                    background: "var(--card-bg-alt)"
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 1.5,
                      alignItems: { xs: "stretch", sm: "center" },
                      flexDirection: { xs: "column", sm: "row" },
                      mb: 1.25
                    }}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight={800}>
                        ลงชื่อ จ่ายแล้ว และคงเหลือตามช่วงเวลา
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {summaryDate ? formatDateLabel(summaryDate) : "ยังไม่มีข้อมูลรายวัน"}
                      </Typography>
                    </Box>
                    <TextField
                      select
                      label="วัน"
                      value={summaryDate}
                      onChange={(event) => setSummaryDate(event.target.value)}
                      size="small"
                      sx={{ minWidth: { xs: "100%", sm: 190 } }}
                    >
                      {summaryDateOptions.map((dateKey) => (
                        <MenuItem key={dateKey} value={dateKey}>
                          {formatDateLabel(dateKey)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  {attendanceChartRows.length === 0 ? (
                    <Box
                      sx={{
                        border: "1px dashed var(--empty-border)",
                        borderRadius: 2,
                        p: 2,
                        textAlign: "center"
                      }}
                    >
                      <Typography color="text.secondary">
                        ยังไม่มีข้อมูลเวลาลงชื่อหรือจ่ายเงินสำหรับวันนี้
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ overflowX: "auto" }}>
                      {(() => {
                        const width = Math.max(620, attendanceChartRows.length * 104);
                        const height = 250;
                        const top = 26;
                        const right = 28;
                        const bottom = 54;
                        const left = 42;
                        const plotWidth = width - left - right;
                        const plotHeight = height - top - bottom;
                        const step = plotWidth / Math.max(1, attendanceChartRows.length);
                        const barWidth = Math.min(44, step * 0.46);
                        const y = (value: number) =>
                          top + plotHeight - (value / attendanceChartMax) * plotHeight;
                        const pointX = (index: number) => left + step * index + step / 2;
                        const joinedLinePoints = attendanceChartRows
                          .map((row, index) => `${pointX(index)},${y(row.joinedTotal)}`)
                          .join(" ");
                        const paidLinePoints = attendanceChartRows
                          .map((row, index) => `${pointX(index)},${y(row.paidTotal)}`)
                          .join(" ");
                        const remainingLinePoints = attendanceChartRows
                          .map((row, index) => `${pointX(index)},${y(row.remaining)}`)
                          .join(" ");
                        return (
                          <Box
                            component="svg"
                            viewBox={`0 0 ${width} ${height}`}
                            role="img"
                            aria-label="กราฟลงชื่อ จ่ายแล้ว และคงเหลือตามช่วงเวลา"
                            sx={{
                              display: "block",
                              minWidth: width,
                              width: "100%",
                              height: 260
                            }}
                          >
                            <line
                              x1={left}
                              y1={top + plotHeight}
                              x2={width - right}
                              y2={top + plotHeight}
                              stroke="var(--border-color)"
                              strokeWidth="1"
                            />
                            {[0.5, 1].map((ratio) => (
                              <line
                                key={ratio}
                                x1={left}
                                y1={top + plotHeight - plotHeight * ratio}
                                x2={width - right}
                                y2={top + plotHeight - plotHeight * ratio}
                                stroke="var(--border-color)"
                                strokeWidth="1"
                                strokeDasharray="4 6"
                                opacity="0.7"
                              />
                            ))}
                            {attendanceChartRows.map((row, index) => {
                              const x = pointX(index);
                              const barHeight = top + plotHeight - y(row.added);
                              return (
                                <g key={row.hour}>
                                  <rect
                                    x={x - barWidth / 2}
                                    y={y(row.added)}
                                    width={barWidth}
                                    height={barHeight}
                                    rx="4"
                                    fill="var(--success-text)"
                                    opacity="0.82"
                                  />
                                  <text
                                    x={x}
                                    y={Math.max(14, y(row.added) - 7)}
                                    textAnchor="middle"
                                    fontSize="12"
                                    fontWeight="700"
                                    fill="currentColor"
                                  >
                                    +{row.added}
                                  </text>
                                  <text
                                    x={x}
                                    y={height - 20}
                                    textAnchor="middle"
                                    fontSize="12"
                                    fill="currentColor"
                                  >
                                    {row.hour}
                                  </text>
                                </g>
                              );
                            })}
                            <polyline
                              points={joinedLinePoints}
                              fill="none"
                              stroke="#2563eb"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <polyline
                              points={paidLinePoints}
                              fill="none"
                              stroke="#e11d48"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity="0.92"
                            />
                            <polyline
                              points={remainingLinePoints}
                              fill="none"
                              stroke="var(--success-text)"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeDasharray="7 6"
                              opacity="0.92"
                            />
                            {attendanceChartRows.map((row, index) => {
                              const x = pointX(index);
                              const joinedCy = y(row.joinedTotal);
                              const paidCy = y(row.paidTotal);
                              const remainingCy = y(row.remaining);
                              return (
                                <g key={`total-${row.hour}`}>
                                  <circle
                                    cx={x}
                                    cy={joinedCy}
                                    r="5"
                                    fill="#2563eb"
                                    stroke="var(--card-bg-alt)"
                                    strokeWidth="2"
                                  />
                                  <text
                                    x={x}
                                    y={Math.max(14, joinedCy - 12)}
                                    textAnchor="middle"
                                    fontSize="12"
                                    fontWeight="800"
                                    fill="#2563eb"
                                  >
                                    {row.joinedTotal}
                                  </text>
                                  <circle
                                    cx={x}
                                    cy={paidCy}
                                    r="4"
                                    fill="#e11d48"
                                    stroke="var(--card-bg-alt)"
                                    strokeWidth="2"
                                  />
                                  <circle
                                    cx={x}
                                    cy={remainingCy}
                                    r="4"
                                    fill="var(--success-text)"
                                    stroke="var(--card-bg-alt)"
                                    strokeWidth="2"
                                  />
                                </g>
                              );
                            })}
                          </Box>
                        );
                      })()}
                      <Stack direction="row" spacing={2} sx={{ mt: 0.5, flexWrap: "wrap" }}>
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, background: "var(--success-text)" }} />
                          <Typography variant="caption" color="text.secondary">
                            เพิ่มมา
                          </Typography>
                        </Box>
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                          <Box sx={{ width: 18, height: 3, borderRadius: 1, background: "#2563eb" }} />
                          <Typography variant="caption" color="text.secondary">
                            รวมสะสม
                          </Typography>
                        </Box>
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                          <Box sx={{ width: 18, height: 3, borderRadius: 1, background: "#e11d48" }} />
                          <Typography variant="caption" color="text.secondary">
                            จ่ายแล้วสะสม
                          </Typography>
                        </Box>
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                          <Box sx={{ width: 18, height: 0, borderTop: "3px dashed var(--success-text)" }} />
                          <Typography variant="caption" color="text.secondary">
                            คงเหลือ
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>
                  )}
                </Box>

                {filteredRoomSummaries.length === 0 ? (
                  <Box
                    sx={{
                      border: "1px dashed var(--empty-border)",
                      borderRadius: 2,
                      p: 2,
                      textAlign: "center"
                    }}
                  >
                    <Typography color="text.secondary">
                      ยังไม่มี Room ที่ครบเงื่อนไขสำหรับสรุปผลรวมในเดือนนี้
                    </Typography>
                  </Box>
                ) : (
                  <Stack spacing={1.25}>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1.15fr 0.85fr" },
                        gap: 1.25
                      }}
                    >
                      <Box
                        sx={{
                          border: "1px solid var(--border-color)",
                          borderRadius: 2,
                          p: 1.5,
                          background: "var(--card-bg-alt)"
                        }}
                      >
                        <Typography variant="body2" fontWeight={800} sx={{ mb: 1.25 }}>
                          ยอดเงินที่รับตาม Room
                        </Typography>
                        <Box
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 1,
                            mb: 1.25
                          }}
                        >
                          {PAYMENT_ACCOUNTS.map((account) => (
                            <Box
                              key={account.id}
                              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                            >
                              <Box
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 0.5,
                                  background:
                                    account.id === "gsb"
                                      ? "var(--selected-chip-bg)"
                                      : "var(--success-text)"
                                }}
                              />
                              <Typography variant="caption" color="text.secondary">
                                {account.label} {formatBaht(dashboardTotals.receivedByAccount[account.id])} บาท
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                        <Stack spacing={1.5}>
                          {filteredRoomSummaries.map((summary) => (
                            <Box key={`money-chart-${summary.roomId}`}>
                              <Box
                                sx={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 1,
                                  mb: 0.75
                                }}
                              >
                                <Typography variant="body2" fontWeight={700}>
                                  {summary.roomId}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {formatBaht(summary.receivedAmount)} บ.
                                </Typography>
                              </Box>
                              <Stack spacing={0.6}>
                                {PAYMENT_ACCOUNTS.map((account) => {
                                  const accountAmount =
                                    summary.receivedByAccount?.[account.id] ?? 0;
                                  const barWidth = Math.max(
                                    accountAmount > 0 ? 2 : 0,
                                    (accountAmount / chartMaxReceivedAmount) * 100
                                  );
                                  const color =
                                    account.id === "gsb"
                                      ? "var(--selected-chip-bg)"
                                      : "var(--success-text)";
                                  return (
                                    <Box
                                      key={account.id}
                                      sx={{ display: "flex", alignItems: "center", gap: 1 }}
                                    >
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ width: 56, flexShrink: 0, textAlign: "right" }}
                                      >
                                        {account.bankName}
                                      </Typography>
                                      <Box
                                        sx={{
                                          flex: 1,
                                          height: 12,
                                          borderRadius: 1,
                                          background: "var(--border-color)",
                                          overflow: "hidden"
                                        }}
                                      >
                                        <Box
                                          title={`${account.label} ${formatBaht(accountAmount)} บาท`}
                                          sx={{
                                            width: `${barWidth}%`,
                                            height: "100%",
                                            background: color,
                                            borderRadius: 1
                                          }}
                                        />
                                      </Box>
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ width: 60, flexShrink: 0 }}
                                      >
                                        {formatBaht(accountAmount)}
                                      </Typography>
                                    </Box>
                                  );
                                })}
                              </Stack>
                            </Box>
                          ))}
                        </Stack>
                      </Box>

                      <Box
                        sx={{
                          border: "1px solid var(--border-color)",
                          borderRadius: 2,
                          p: 1.5,
                          background: "var(--card-bg-alt)"
                        }}
                      >
                        <Typography variant="body2" fontWeight={800} sx={{ mb: 1.25 }}>
                          จำนวนคนและจำนวนลูก
                        </Typography>
                        <Stack spacing={1.15}>
                          {filteredRoomSummaries.map((summary) => {
                            const peopleWidth = `${Math.max(
                              5,
                              (summary.peopleCount / chartMaxActivityCount) * 100
                            )}%`;
                            const shuttleWidth = `${Math.max(
                              5,
                              (summary.shuttleCount / chartMaxActivityCount) * 100
                            )}%`;
                            return (
                              <Box key={`activity-chart-${summary.roomId}`}>
                              <Box
                                sx={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 1,
                                  mb: 0.5
                                }}
                              >
                                <Typography variant="body2" fontWeight={700}>
                                  {summary.roomId}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {summary.peopleCount} คน · {summary.shuttleCount} ลูก
                                </Typography>
                              </Box>
                              <Stack spacing={0.5}>
                                <Box
                                  sx={{
                                    display: "grid",
                                    gridTemplateColumns: "38px 1fr",
                                    alignItems: "center",
                                    gap: 0.75
                                  }}
                                >
                                  <Typography variant="caption" color="text.secondary">
                                    คน
                                  </Typography>
                                  <Box
                                    sx={{
                                      height: 10,
                                      borderRadius: 1,
                                      background: "var(--border-color)",
                                      overflow: "hidden"
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        width: peopleWidth,
                                        height: "100%",
                                        borderRadius: 1,
                                        background: "var(--success-text)"
                                      }}
                                    />
                                  </Box>
                                </Box>
                                <Box
                                  sx={{
                                    display: "grid",
                                    gridTemplateColumns: "38px 1fr",
                                    alignItems: "center",
                                    gap: 0.75
                                  }}
                                >
                                  <Typography variant="caption" color="text.secondary">
                                    ลูก
                                  </Typography>
                                  <Box
                                    sx={{
                                      height: 10,
                                      borderRadius: 1,
                                      background: "var(--border-color)",
                                      overflow: "hidden"
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        width: shuttleWidth,
                                        height: "100%",
                                        borderRadius: 1,
                                        background: "var(--warning-text)"
                                      }}
                                    />
                                  </Box>
                                </Box>
                              </Stack>
                            </Box>
                            );
                          })}
                        </Stack>
                      </Box>
                    </Box>

                    <Box>
                      <Button
                        variant="outlined"
                        size="small"
                        endIcon={
                          <ExpandMoreIcon
                            sx={{
                              transform: summaryDetailsOpen ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "transform 160ms ease"
                            }}
                          />
                        }
                        onClick={() => setSummaryDetailsOpen((open) => !open)}
                        aria-expanded={summaryDetailsOpen}
                        aria-controls="summary-room-details"
                      >
                        รายละเอียด
                      </Button>
                      <Collapse in={summaryDetailsOpen} timeout={180}>
                        <Stack
                          id="summary-room-details"
                          spacing={1}
                          sx={{ pt: 1.25 }}
                        >
                          {filteredRoomSummaries.map((summary) => (
                            <Box
                              key={summary.roomId}
                              sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                  xs: "1fr",
                                  sm: "1.2fr repeat(4, minmax(88px, 1fr))"
                                },
                                gap: 1,
                                alignItems: "center",
                                border: "1px solid var(--border-color)",
                                borderRadius: 2,
                                p: 1.5
                              }}
                            >
                              <Box>
                                <Typography fontWeight={800}>{summary.roomId}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  เริ่ม {formatStartedAt(summary.startedAt)}
                                </Typography>
                              </Box>
                              <Typography>
                                คน <strong>{summary.peopleCount}</strong>
                              </Typography>
                              <Typography>
                                ลูก <strong>{summary.shuttleCount}</strong>
                              </Typography>
                              <Typography>
                                รับแล้ว <strong>{formatBaht(summary.receivedAmount)}</strong> บาท
                              </Typography>
                              <Box>
                                {PAYMENT_ACCOUNTS.map((account) => {
                                  const accountAmount =
                                    summary.receivedByAccount?.[account.id] ?? 0;
                                  return (
                                    <Typography
                                      key={account.id}
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ display: "block" }}
                                    >
                                      {account.label} {formatBaht(accountAmount)} บาท
                                    </Typography>
                                  );
                                })}
                              </Box>
                            </Box>
                          ))}
                        </Stack>
                      </Collapse>
                    </Box>
                  </Stack>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Container>

        <Dialog
          open={deleteDialogOpen}
          onClose={closeDeleteDialog}
          aria-labelledby="delete-room-dialog-title"
        >
          <DialogTitle id="delete-room-dialog-title" sx={{ fontWeight: 800, color: "var(--danger-text)" }}>
            ลบ Room
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              ลบ room &quot;{deletingRoomId}&quot; ใช่ไหม?
              <br />
              {hasSupabaseConfig
                ? "ข้อมูลทั้งหมดใน room นี้จะถูกลบทั้งจากฐานข้อมูลและเครื่องนี้"
                : "ข้อมูลทั้งหมดใน room นี้จะถูกลบจากเครื่องนี้"}
              <br />
              ข้อมูลสรุปที่ถูกเก็บไว้สำหรับ dashboard แล้วจะยังอยู่
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={closeDeleteDialog} variant="outlined" disabled={deleteSubmitting}>
              ยกเลิก
            </Button>
            <Button
              onClick={confirmDeleteRoom}
              variant="contained"
              color="error"
              disabled={deleteSubmitting}
            >
              ลบ
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}
