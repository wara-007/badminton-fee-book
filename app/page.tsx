"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RemoveIcon from "@mui/icons-material/Remove";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
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
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme
} from "@mui/material";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Player,
  REST_MINUTES,
  SessionState,
  appendActivity,
  calculatePlayerTotal,
  createActivity,
  createInitialSession,
  createPlayer,
  exportSessionSummary,
  findMatchOverlapWarning,
  getPlayerShuttleCount,
  getPlayerShuttleMarks,
  getPlayerWaitStatus,
  getPriorityPlayers,
  getShuttleMarkSummary,
  getVisibleShuttleColumns,
  groupMatchesByShuttle,
  groupPaidPlayersByDay,
  normalizeSession,
  setPlayerShuttleMarks,
  summarizeSession
} from "@/lib/session";
import {
  hasSupabaseConfig,
  loadRemoteNow,
  loadRemoteSession,
  saveRemoteSession,
  subscribeRemoteSession
} from "@/lib/supabase-session";
import packageInfo from "@/package.json";

const bahtFormatter = new Intl.NumberFormat("th-TH");
const appVersion = packageInfo.version;
const AUTH_STORAGE_KEY = "badminton-fee-book.auth";
type UserRole = "admin" | "admin2";
type AuthSession = {
  role: UserRole;
};
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric"
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
  confirmLabel?: string;
  cancelLabel?: string;
  color?: "primary" | "error" | "warning" | "secondary";
};

type AppDialogState = AppDialogOptions & {
  open: boolean;
  mode: "alert" | "confirm";
  resolve?: (value: boolean) => void;
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

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0f766e"
    },
    secondary: {
      main: "#b45309"
    },
    background: {
      default: "#f7f5ef",
      paper: "#ffffff"
    },
    text: {
      primary: "#1f2933",
      secondary: "#5f6c7b"
    }
  },
  shape: {
    borderRadius: 8
  },
  typography: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: {
      textTransform: "none",
      fontWeight: 700
    }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 44
        }
      }
    },
    MuiTextField: {
      defaultProps: {
        size: "small"
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: "#e7e2d8"
        }
      }
    }
  }
});

export default function HomePage() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [sessionId, setSessionId] = useState("main");
  const [roomDraft, setRoomDraft] = useState("main");
  const [session, setSession] = useState<SessionState>(() => createInitialSession());
  const [playerName, setPlayerName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [matchSearchTerm, setMatchSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [mobileSummaryExpanded, setMobileSummaryExpanded] = useState(false);
  const [editingShuttleNumber, setEditingShuttleNumber] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(hasSupabaseConfig ? "กำลังเชื่อมต่อ" : "โหมดเครื่องนี้");
  const [dialog, setDialog] = useState<AppDialogState>({
    open: false,
    mode: "alert",
    title: "",
    message: ""
  });
  const lastRemoteSnapshotRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockOffsetRef = useRef(0);

  useEffect(() => {
    const initialSessionId = getInitialSessionId();
    setSessionId(initialSessionId);
    setRoomDraft(initialSessionId);
    setRoomReady(true);
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

    async function loadSession() {
      if (hasSupabaseConfig) {
        setSyncStatus("กำลังเชื่อมต่อ");
        try {
          const remoteSession = await loadRemoteSession(sessionId);
          if (cancelled) {
            return;
          }
          const snapshot = serializeSession(remoteSession);
          lastRemoteSnapshotRef.current = snapshot;
          setSession(remoteSession);
          localStorage.setItem(getStorageKey(sessionId), snapshot);
          setSyncStatus("ซิงก์แล้ว");
        } catch {
          if (cancelled) {
            return;
          }
          loadLocalSession(sessionId, setSession);
          setSyncStatus("ใช้ข้อมูลเครื่องนี้");
        }
      } else {
        loadLocalSession(sessionId, setSession);
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

    return subscribeRemoteSession(sessionId, (remoteSession) => {
      const snapshot = serializeSession(remoteSession);
      if (snapshot === lastRemoteSnapshotRef.current) {
        return;
      }
      lastRemoteSnapshotRef.current = snapshot;
      setSession(remoteSession);
      localStorage.setItem(getStorageKey(sessionId), snapshot);
      setSyncStatus("ซิงก์แล้ว");
    });
  }, [hydrated, sessionId]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const snapshot = serializeSession(session);
    localStorage.setItem(getStorageKey(sessionId), snapshot);

    if (!hasSupabaseConfig || snapshot === lastRemoteSnapshotRef.current) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setSyncStatus("กำลังบันทึก");
    saveTimerRef.current = setTimeout(() => {
      saveRemoteSession(sessionId, session)
        .then(() => {
          lastRemoteSnapshotRef.current = snapshot;
          setSyncStatus("ซิงก์แล้ว");
        })
        .catch(() => setSyncStatus("ซิงก์ไม่สำเร็จ"));
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
  const noteShuttleSummary = useMemo(
    () =>
      getShuttleMarkSummary(
        session.players,
        activeShuttleNumber
      ),
    [activeShuttleNumber, session.players]
  );
  const userRole = authSession?.role ?? null;
  const canManageSession = userRole === "admin";
  const canSetPaid = userRole === "admin" || userRole === "admin2";
  const isEditingLocked = editingShuttleNumber !== null && !currentShuttleSummary.isComplete;
  const activePlayers = useMemo(
    () => session.players.filter((player) => !player.paid),
    [session.players]
  );
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("th-TH");
  const visibleActivePlayers = useMemo(() => {
    if (!normalizedSearch) {
      return activePlayers;
    }
    return activePlayers.filter((player) =>
      player.name.toLocaleLowerCase("th-TH").includes(normalizedSearch)
    );
  }, [activePlayers, normalizedSearch]);
  const paidGroups = useMemo(
    () => groupPaidPlayersByDay(session.players, session.pricing),
    [session.players, session.pricing]
  );
  const matchGroups = useMemo(() => groupMatchesByShuttle(session.players), [session.players]);
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
  const shuttleColumns = useMemo(
    () =>
      Array.from(
        {
          length: getVisibleShuttleColumns(visibleActivePlayers)
        },
        (_, index) => index
      ),
    [visibleActivePlayers]
  );

  function updateSession(updater: (current: SessionState) => SessionState) {
    setSession((current) => ({
      ...updater(current),
      updatedAt: getTrustedNowIso()
    }));
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
    const activeSessionId = getInitialSessionId();
    setSessionId(activeSessionId);
    setRoomDraft(activeSessionId);
    persistSessionId(activeSessionId);
    setAuthSession(nextAuthSession);
    setLoginName("");
    setLoginPassword("");
    setLoginError("");
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuthSession));
  }

  function logout() {
    setAuthSession(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEditingLocked || !canManageSession) {
      return;
    }

    const trimmedName = playerName.trim();
    if (!trimmedName) {
      return;
    }

    const duplicatedPlayer = session.players.find(
      (player) => player.name.trim().toLocaleLowerCase("th-TH") === trimmedName.toLocaleLowerCase("th-TH")
    );
    if (duplicatedPlayer) {
      await showAlert({
        title: "ชื่อซ้ำ",
        headline: `มีชื่อ ${duplicatedPlayer.name} อยู่แล้ว`,
        message: "เพิ่มชื่อซ้ำไม่ได้ เพื่อกันการคิดเงินผิดคน",
        details: [{ label: "ชื่อที่ซ้ำ", value: duplicatedPlayer.name, tone: "warning" }],
        confirmLabel: "รับทราบ",
        color: "warning"
      });
      return;
    }

    const createdAt = getTrustedNowIso();
    updateSession((current) => ({
      ...current,
      players: [
        ...current.players,
        {
          ...createPlayer(trimmedName),
          waitingSince: createdAt
        }
      ]
    }));
    setPlayerName("");
    setActiveTab(0);
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
          players: current.players.filter((player) => player.id !== id)
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
      updateSession((current) => ({
        ...current,
        currentShuttleNumber: 1,
        activityLog: [],
        players: current.players.map((player) => ({
          ...player,
          shuttleCount: 0,
          shuttleMarks: [],
          paid: false,
          paidAt: undefined
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
    if (isEditingLocked || !canManageSession) {
      return;
    }

    const numericValue = value === "" ? 0 : Math.max(1, Number(value) || 1);
    setEditingShuttleNumber(null);
    updateSession((current) => ({
      ...current,
      currentShuttleNumber: numericValue
    }));
  }

  function stepCurrentShuttleNumber(step: number) {
    if (isEditingLocked || !canManageSession) {
      return;
    }

    if (editingShuttleNumber !== null) {
      setEditingShuttleNumber(Math.max(1, editingShuttleNumber + step));
      return;
    }

    setEditingShuttleNumber(null);
    updateSession((current) => ({
      ...current,
      currentShuttleNumber: Math.max(1, current.currentShuttleNumber + step)
    }));
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

    const nextPlayers = session.players.map((currentPlayer) =>
      currentPlayer.id === playerId
        ? setPlayerShuttleMarks(
          currentPlayer,
          isRemoving
            ? getPlayerShuttleMarks(currentPlayer).filter((_, markIndex) => markIndex !== column)
            : [...getPlayerShuttleMarks(currentPlayer), targetShuttleNumber]
        )
        : currentPlayer
    );

    const targetShuttleSummary = getShuttleMarkSummary(nextPlayers, targetShuttleNumber);
    const completedPlayerNames = targetShuttleSummary.names.slice(-4).join(", ");
    const overlapWarning = !isRemoving && targetShuttleSummary.isComplete
      ? findMatchOverlapWarning(nextPlayers, targetShuttleNumber)
      : null;
    const shouldAdvanceAfterConfirm =
      !isRemoving &&
      targetShuttleSummary.isComplete &&
      targetShuttleNumber === session.currentShuttleNumber &&
      editingShuttleNumber === null;
    const shouldAskToConfirmComplete =
      !isRemoving &&
      targetShuttleSummary.isComplete &&
      (shouldAdvanceAfterConfirm || editingShuttleNumber !== null);
    const confirmedComplete =
      shouldAskToConfirmComplete &&
      await showConfirm({
        title: "ยืนยัน Match",
        headline: "ครบ 4 คนแล้ว",
        message: shouldAdvanceAfterConfirm
          ? "ยืนยัน Match นี้แล้วระบบจะเลื่อนไปลูกถัดไป"
          : "ยืนยัน Match นี้เพื่อจบการแก้ลูกเก่า",
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
    const nextShuttleNumber = shouldAdvanceAfterConfirm && confirmedComplete
      ? targetShuttleNumber + 1
      : session.currentShuttleNumber;
    const confirmedAt = getTrustedNowIso();
    const restUntil = addMinutes(confirmedAt, REST_MINUTES);
    const restedPlayers = shouldAdvanceAfterConfirm && confirmedComplete
      ? nextPlayers.map((currentPlayer) =>
        getPlayerShuttleMarks(currentPlayer).includes(targetShuttleNumber)
          ? {
            ...currentPlayer,
            restUntil,
            waitingSince: restUntil
          }
          : currentPlayer
      )
      : nextPlayers;

    const shouldKeepEditingShuttle =
      !targetShuttleSummary.isComplete && (isRemoving || editingShuttleNumber !== null);
    setEditingShuttleNumber(shouldKeepEditingShuttle ? targetShuttleNumber : null);
    updateSession((current) => {
      let nextSession: SessionState = {
        ...current,
        players: restedPlayers,
        currentShuttleNumber: nextShuttleNumber
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

    if (!(await showConfirm({
      title: paid ? "ยืนยันการจ่ายเงิน" : "ย้ายกลับค้างจ่าย",
      headline: paid ? `${player.name} จ่ายแล้วใช่ไหม?` : `ย้าย ${player.name} กลับไปค้างจ่ายใช่ไหม?`,
      message: paid ? "หลังยืนยัน คนนี้จะถูกย้ายไป tab สรุปจ่ายแล้ว" : "คนนี้จะกลับไปอยู่ในรายชื่อค้างจ่าย",
      details: [
        { label: "ผู้เล่น", value: player.name, tone: paid ? "primary" : "warning" },
        {
          label: "ยอดเงิน",
          value: `${formatBaht(calculatePlayerTotal(player, session.pricing))} บาท`,
          tone: paid ? "primary" : "warning"
        }
      ],
      confirmLabel: paid ? "จ่ายแล้ว" : "ย้ายกลับ",
      color: paid ? "primary" : "warning"
    }))) {
      return;
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
                  paidAt: paid ? getTrustedNowIso() : undefined
                }
              : currentPlayer
          )
        },
        createActivity(
          paid ? "paid" : "unpaid",
          paid
            ? `${player.name} จ่ายแล้ว ${formatBaht(calculatePlayerTotal(player, session.pricing))} บาท`
            : `ย้าย ${player.name} กลับไปค้างจ่าย`,
          getTrustedNowIso()
        )
      )
    );
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
        <Container maxWidth="xl" className="appContainer">
          <Stack spacing={3}>
            <Box className="appHeader">
              <Box>
                <Typography variant="h4" component="h1" className="appTitle">
                  สมุดค่าตีแบด
                </Typography>
                <Typography color="text.secondary">
                  จดลูก คิดเงิน และเช็กจ่ายแล้วในรอบเดียว
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center" className="authStatus">
                <Chip
                  label={userRole === "admin" ? "admin: ทำได้ทุกอย่าง" : "admin2: จ่ายเงินเท่านั้น"}
                  color={userRole === "admin" ? "primary" : "secondary"}
                  variant="outlined"
                />
                <Button variant="outlined" onClick={logout}>
                  ออกจากระบบ
                </Button>
              </Stack>
            </Box>

            <Paper className="controlBand" elevation={0}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} className="quickControls">
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
                <Chip label={syncStatus} size="small" />
              </Stack>
            </Paper>

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
              >
                <Tab label={`กำลังตี (${activePlayers.length})`} />
                <Tab label={`Match (${matchGroups.length})`} disabled={isEditingLocked} />
                <Tab
                  label={`สรุปจ่ายแล้ว (${formatBaht(summary.paidAmount)} บาท)`}
                  disabled={isEditingLocked}
                />
              </Tabs>
              <Divider />

              {activeTab === 0 ? (
                <>
                  <Box className="sheetToolbar">
                    <TextField
                      label="ค้นหาชื่อ"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="searchField"
                      autoComplete="off"
                    />
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography fontWeight={800}>ลูก number</Typography>
                      <IconButton
                        aria-label="ลดลูก number"
                        onClick={() => stepCurrentShuttleNumber(-1)}
                        disabled={isEditingLocked || !canManageSession || activeShuttleNumber <= 1}
                      >
                        <RemoveIcon />
                      </IconButton>
                      <TextField
                        label="ลูก number"
                        type="number"
                        value={activeShuttleNumber}
                        onChange={(event) => updateCurrentShuttleNumber(event.target.value)}
                        disabled={isEditingLocked || !canManageSession}
                        inputProps={{ min: 1 }}
                        className="currentShuttleField"
                      />
                      <IconButton
                        aria-label="เพิ่มลูก number"
                        onClick={() => stepCurrentShuttleNumber(1)}
                        disabled={isEditingLocked || !canManageSession}
                      >
                        <AddIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                  <CurrentShuttleTracker
                    summary={currentShuttleSummary}
                    isEditingLocked={isEditingLocked}
                  />
                  <PriorityPlayers players={priorityPlayers} now={now} />
                  <ScoreSheet
                    activePlayers={visibleActivePlayers}
                    allPlayerCount={session.players.length}
                    hasSearch={Boolean(normalizedSearch)}
                    incompleteShuttleNumbers={incompleteShuttleNumbers}
                    overLimitShuttleNumbers={overLimitShuttleNumbers}
                    now={now}
                    pricing={session.pricing}
                    shuttleColumns={shuttleColumns}
                    editingShuttleNumber={editingShuttleNumber}
                    isEditingLocked={isEditingLocked}
                    canManageSession={canManageSession}
                    canSetPaid={canSetPaid}
                    onRemovePlayer={removePlayer}
                    onSetPaid={setPaid}
                    onToggleShuttleMark={toggleShuttleMark}
                  />
                  <RecentActivity activityLog={session.activityLog} now={now} />
                </>
              ) : activeTab === 1 ? (
                <MatchSummaryPanel
                  matchGroups={matchGroups}
                  searchTerm={matchSearchTerm}
                  onSearchTermChange={setMatchSearchTerm}
                />
              ) : (
                <PaidSummary
                  players={session.players}
                  paidGroups={visiblePaidGroups}
                  hasSearch={Boolean(normalizedSearch)}
                  onSetPaid={setPaid}
                  onClearPlayData={clearPlayData}
                  onResetSession={resetSession}
                  onCopySummary={copySummary}
                  canManageSession={canManageSession}
                  canSetPaid={canSetPaid}
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
          {dialog.note ? (
            <Typography className={`appDialogNote appDialogNote-${dialog.color ?? "primary"}`}>
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
    </ThemeProvider>
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
  now,
  pricing,
  shuttleColumns,
  editingShuttleNumber,
  isEditingLocked,
  canManageSession,
  canSetPaid,
  onRemovePlayer,
  onSetPaid,
  onToggleShuttleMark
}: {
  activePlayers: Player[];
  allPlayerCount: number;
  hasSearch: boolean;
  incompleteShuttleNumbers: ReadonlySet<number>;
  overLimitShuttleNumbers: ReadonlySet<number>;
  now: string;
  pricing: SessionState["pricing"];
  shuttleColumns: number[];
  editingShuttleNumber: number | null;
  isEditingLocked: boolean;
  canManageSession: boolean;
  canSetPaid: boolean;
  onRemovePlayer: (id: string) => void;
  onSetPaid: (id: string, paid: boolean) => void;
  onToggleShuttleMark: (id: string, column: number) => void;
}) {
  return (
    <TableContainer className="scoreTableWrap">
      <Table stickyHeader size="small" aria-label="ตารางค่าตีแบด">
        <TableHead>
          <TableRow>
            <TableCell className="stickyName">ชื่อ</TableCell>
            {shuttleColumns.map((column) => (
              <TableCell key={column} align="center" className="shuttleHeader">
                {column + 1}
              </TableCell>
            ))}
            <TableCell align="center">ลูก</TableCell>
            <TableCell align="right">ยอด</TableCell>
            <TableCell align="center">จ่ายแล้ว</TableCell>
            <TableCell align="center">ลบ</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {activePlayers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={shuttleColumns.length + 5} className="emptyCell">
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
                className={getWaitingRowClass(player, now)}
              >
                <TableCell className="stickyName playerCell">
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
                      const isOverLimit =
                        typeof shuttleMark === "number" &&
                        overLimitShuttleNumbers.has(shuttleMark);
                      const isIncomplete =
                        typeof shuttleMark === "number" &&
                        incompleteShuttleNumbers.has(shuttleMark);
                      const isLockedOtherShuttle =
                        isEditingLocked &&
                        typeof shuttleMark === "number" &&
                        shuttleMark !== editingShuttleNumber;
                      const isDisabled = !canManageSession || isLockedOtherShuttle;
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
                                }${isIncomplete ? " shuttleNumberIconWarning" : ""}`}
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
                <TableCell align="right" className="amountCell">
                  {formatBaht(calculatePlayerTotal(player, pricing))}
                </TableCell>
                <TableCell align="center">
                  <Checkbox
                    inputProps={{ "aria-label": `${player.name} จ่ายแล้ว` }}
                    checked={player.paid}
                    disabled={isEditingLocked || !canSetPaid}
                    onChange={(event) => onSetPaid(player.id, event.target.checked)}
                  />
                </TableCell>
                <TableCell align="center">
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

function CurrentShuttleTracker({
  summary,
  isEditingLocked
}: {
  summary: ReturnType<typeof getShuttleMarkSummary>;
  isEditingLocked: boolean;
}) {
  const statusText =
    summary.count === 0
      ? "ยังไม่ได้ติ๊ก"
      : summary.isComplete
        ? "ครบ 4 แล้ว"
        : `เหลืออีก ${summary.missingCount} ติ๊ก`;

  return (
    <Box className="currentShuttleTracker">
      <Box>
        <Typography fontWeight={800}>กำลังเลือกลูก {summary.shuttleNumber}</Typography>
        <Typography color="text.secondary" className="currentShuttleNames">
          {summary.names.length > 0 ? summary.names.join(", ") : "ยังไม่มีชื่อที่ติ๊ก"}
        </Typography>
        {isEditingLocked ? (
          <Typography color="warning.main" className="currentShuttleLockNote">
            กำลังแก้ลูกนี้ให้ครบก่อน จึงทำรายการอื่นได้
          </Typography>
        ) : null}
      </Box>
      <Chip
        label={`${summary.count}/4 ${statusText}`}
        color={summary.isComplete ? "primary" : "default"}
        variant={summary.isComplete ? "filled" : "outlined"}
      />
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

function RecentActivity({
  activityLog,
  now
}: {
  activityLog: SessionState["activityLog"];
  now: string;
}) {
  return (
    <Box className="activityPanel" role="region" aria-label="ประวัติการแก้ไขล่าสุด">
      <Typography variant="h6" component="h2">
        ประวัติการแก้ไขล่าสุด
      </Typography>
      {activityLog.length === 0 ? (
        <Typography color="text.secondary">ยังไม่มีประวัติ</Typography>
      ) : (
        <Stack spacing={1}>
          {activityLog.slice(0, 8).map((activity) => (
            <Box key={activity.id} className="activityItem">
              <Typography>{activity.message}</Typography>
              <Typography color="text.secondary" fontSize={13}>
                {formatRelativeTime(activity.createdAt, now)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function MatchSummaryPanel({
  matchGroups,
  searchTerm,
  onSearchTermChange
}: {
  matchGroups: ReturnType<typeof groupMatchesByShuttle>;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
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
        <Typography variant="h5" component="h2">
          Match
        </Typography>
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
              className={`matchItem${group.isOverLimit ? " matchItemDanger" : ""}${group.isIncomplete ? " matchItemWarning" : ""
                }`}
              elevation={0}
            >
              <Typography variant="h6" component="h3">
                ลูกที่ {group.shuttleNumber}
              </Typography>
              <Typography className="matchNames">
                {group.playerNames.join(" ")}
                {group.isOverLimit ? ` (${group.playerNames.length}/4 เกิน)` : ""}
                {group.isIncomplete ? ` (${group.playerNames.length}/4 ยังไม่ครบ)` : ""}
              </Typography>
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
  onClearPlayData,
  onResetSession,
  onCopySummary,
  canManageSession,
  canSetPaid
}: {
  players: Player[];
  paidGroups: ReturnType<typeof groupPaidPlayersByDay>;
  hasSearch: boolean;
  onSetPaid: (id: string, paid: boolean) => void;
  onClearPlayData: () => void;
  onResetSession: () => void;
  onCopySummary: () => void;
  canManageSession: boolean;
  canSetPaid: boolean;
}) {
  return (
    <Box className="paidSummaryPanel" role="region" aria-label="รายการจ่ายแล้ว">
      <Box className="paidSummaryHeader">
        <Typography variant="h5" component="h2">
          สรุปจ่ายแล้ว
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} className="paidSummaryActions">
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
        </Stack>
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

                  return (
                    <Box key={`${group.dateKey}-${paidPlayer.name}`} className="paidPlayerItem">
                      <Box>
                        <Typography fontWeight={800}>{paidPlayer.name}</Typography>
                        <Typography color="text.secondary">{paidPlayer.shuttleCount} ลูก</Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography fontWeight={800}>{formatBaht(paidPlayer.amount)} บาท</Typography>
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

function serializeSession(session: SessionState): string {
  return JSON.stringify(session);
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

function loadLocalSession(sessionId: string, setSession: (session: SessionState) => void) {
  const stored = localStorage.getItem(getStorageKey(sessionId));
  if (!stored) {
    setSession(createInitialSession());
    return;
  }

  try {
    setSession(normalizeSession(JSON.parse(stored)));
  } catch {
    setSession(createInitialSession());
  }
}
