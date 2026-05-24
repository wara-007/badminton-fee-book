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
  SessionState,
  calculatePlayerTotal,
  createInitialSession,
  createPlayer,
  getPlayerShuttleCount,
  getPlayerShuttleMarks,
  getVisibleShuttleColumnsForCurrent,
  groupMatchesByShuttle,
  groupPaidPlayersByDay,
  hasShuttleMark,
  normalizeSession,
  setPlayerShuttleMarks,
  summarizeSession
} from "@/lib/session";
import {
  hasSupabaseConfig,
  loadRemoteSession,
  saveRemoteSession,
  subscribeRemoteSession
} from "@/lib/supabase-session";

const bahtFormatter = new Intl.NumberFormat("th-TH");
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

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
  const [sessionId, setSessionId] = useState("main");
  const [roomDraft, setRoomDraft] = useState("main");
  const [session, setSession] = useState<SessionState>(() => createInitialSession());
  const [playerName, setPlayerName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [matchSearchTerm, setMatchSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(hasSupabaseConfig ? "กำลังเชื่อมต่อ" : "โหมดเครื่องนี้");
  const lastRemoteSnapshotRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const initialSessionId = getInitialSessionId();
    setSessionId(initialSessionId);
    setRoomDraft(initialSessionId);
    setRoomReady(true);
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
  const shuttleColumns = useMemo(
    () =>
      Array.from(
        {
          length: getVisibleShuttleColumnsForCurrent(
            visibleActivePlayers,
            session.currentShuttleNumber
          )
        },
        (_, index) => index
      ),
    [session.currentShuttleNumber, visibleActivePlayers]
  );

  function updateSession(updater: (current: SessionState) => SessionState) {
    setSession((current) => ({
      ...updater(current),
      updatedAt: new Date().toISOString()
    }));
  }

  function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      return;
    }

    const duplicatedPlayer = session.players.find(
      (player) => player.name.trim().toLocaleLowerCase("th-TH") === trimmedName.toLocaleLowerCase("th-TH")
    );
    if (duplicatedPlayer) {
      window.alert(`มีชื่อ ${duplicatedPlayer.name} อยู่แล้ว`);
      return;
    }

    updateSession((current) => ({
      ...current,
      players: [...current.players, createPlayer(trimmedName)]
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

  function removePlayer(id: string) {
    const player = session.players.find((currentPlayer) => currentPlayer.id === id);
    if (!player || !window.confirm(`ลบ ${player.name} ออกจากรอบนี้ใช่ไหม?`)) {
      return;
    }

    updateSession((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== id)
    }));
  }

  function resetSession() {
    if (window.confirm("ล้างข้อมูลรอบนี้ทั้งหมดใช่ไหม?")) {
      updateSession(() => createInitialSession());
      setActiveTab(0);
    }
  }

  function clearPlayData() {
    if (window.confirm("ล้างลูกที่ติ๊กและสถานะจ่ายแล้ว แต่เก็บรายชื่อไว้ใช่ไหม?")) {
      updateSession((current) => ({
        ...current,
        currentShuttleNumber: 1,
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
    const nextSessionId = normalizeSessionId(roomDraft);
    setRoomDraft(nextSessionId);
    setSessionId(nextSessionId);
    persistSessionId(nextSessionId);
  }

  function updatePricing(key: "baseFee" | "shuttleFee", value: string) {
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
    const numericValue = value === "" ? 0 : Math.max(1, Number(value) || 1);
    updateSession((current) => ({
      ...current,
      currentShuttleNumber: numericValue
    }));
  }

  function stepCurrentShuttleNumber(step: number) {
    updateSession((current) => ({
      ...current,
      currentShuttleNumber: Math.max(1, current.currentShuttleNumber + step)
    }));
  }

  function toggleShuttleMark(playerId: string, column: number) {
    const player = session.players.find((currentPlayer) => currentPlayer.id === playerId);
    if (!player) {
      return;
    }

    const currentMarks = getPlayerShuttleMarks(player);
    const removedShuttleNumber = currentMarks[column];
    const isRemoving = typeof removedShuttleNumber === "number";
    if (isRemoving && !window.confirm("เอาออกแน่นะอีแก่")) {
      return;
    }

    const targetShuttleNumber = isRemoving
      ? removedShuttleNumber
      : Math.max(1, session.currentShuttleNumber);
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

    const checkedCountForColumn = nextPlayers.reduce(
      (count, currentPlayer) =>
        currentPlayer.paid
          ? count
          : count +
            getPlayerShuttleMarks(currentPlayer).filter((mark) => mark === targetShuttleNumber)
              .length,
      0
    );
    const nextShuttleNumber =
      !isRemoving &&
      checkedCountForColumn >= 4 &&
      targetShuttleNumber >= session.currentShuttleNumber &&
      window.confirm(`ครบ 4 คนแล้ว ไปที่ลูก ${targetShuttleNumber + 1} ใช่ไหม?`)
        ? targetShuttleNumber + 1
        : session.currentShuttleNumber;

    updateSession((current) => ({
      ...current,
      players: nextPlayers,
      currentShuttleNumber: nextShuttleNumber
    }));
  }

  function setPaid(playerId: string, paid: boolean) {
    const player = session.players.find((currentPlayer) => currentPlayer.id === playerId);
    if (!player) {
      return;
    }

    const message = paid
      ? `ยืนยันว่า ${player.name} จ่ายแล้วใช่ไหม?`
      : `ย้าย ${player.name} กลับไปค้างจ่ายใช่ไหม?`;
    if (!window.confirm(message)) {
      return;
    }

    updatePlayer(playerId, (current) => ({
      ...current,
      paid,
      paidAt: paid ? new Date().toISOString() : undefined
    }));
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
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button color="secondary" variant="outlined" onClick={clearPlayData}>
                  ล้างข้อมูลเล่น
                </Button>
                <Button
                  color="secondary"
                  variant="outlined"
                  startIcon={<RestartAltIcon />}
                  onClick={resetSession}
                >
                  รีเซ็ตรอบ
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
                    fullWidth
                    autoComplete="off"
                  />
                  <Button type="submit" variant="contained" startIcon={<AddIcon />}>
                    เพิ่มผู้เล่น
                  </Button>
                </Box>
                <TextField
                  label="ค้นหาชื่อ"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="searchField"
                  autoComplete="off"
                />
              </Stack>
              <Collapse in={settingsExpanded}>
                <Box className="settingsPanel">
                  <Box component="form" onSubmit={switchSession} className="roomForm">
                    <TextField
                      label="รหัสรอบ"
                      value={roomDraft}
                      onChange={(event) => setRoomDraft(event.target.value)}
                      autoComplete="off"
                    />
                    <Button type="submit" variant="outlined">
                      เปิดรอบ
                    </Button>
                  </Box>
                  <TextField
                    label="ค่าเริ่มต้น"
                    type="number"
                    value={session.pricing.baseFee}
                    onChange={(event) => updatePricing("baseFee", event.target.value)}
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
              <SummaryStat label="ผู้เล่น" value={`${summary.playerCount} คน`} />
              <SummaryStat label="ลูกทั้งหมด" value={`${summary.shuttleCount} ลูก`} />
              <SummaryStat label="รวม" value={`ยอดรวม ${formatBaht(summary.totalAmount)} บาท`} />
              <SummaryStat
                label="จ่ายแล้ว"
                value={`จ่ายแล้ว ${formatBaht(summary.paidAmount)} บาท`}
              />
              <SummaryStat
                label="ค้างจ่าย"
                value={`ค้างจ่าย ${formatBaht(summary.unpaidAmount)} บาท`}
              />
            </Box>

            <Paper className="tablePanel" elevation={0}>
              <Tabs
                value={activeTab}
                onChange={(_, nextTab: number) => setActiveTab(nextTab)}
                aria-label="มุมมองสมุดค่าตีแบด"
                className="sheetTabs"
              >
                <Tab label={`กำลังตี (${activePlayers.length})`} />
                <Tab label={`Match (${matchGroups.length})`} />
                <Tab label={`สรุปจ่ายแล้ว (${formatBaht(summary.paidAmount)} บาท)`} />
              </Tabs>
              <Divider />

              {activeTab === 0 ? (
                <>
                  <Box className="sheetToolbar">
                    <Typography fontWeight={800}>ลูก number</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconButton
                        aria-label="ลดลูก number"
                        onClick={() => stepCurrentShuttleNumber(-1)}
                        disabled={session.currentShuttleNumber <= 1}
                      >
                        <RemoveIcon />
                      </IconButton>
                      <TextField
                        label="ลูก number"
                        type="number"
                        value={session.currentShuttleNumber}
                        onChange={(event) => updateCurrentShuttleNumber(event.target.value)}
                        inputProps={{ min: 1 }}
                        className="currentShuttleField"
                      />
                      <IconButton
                        aria-label="เพิ่มลูก number"
                        onClick={() => stepCurrentShuttleNumber(1)}
                      >
                        <AddIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                  <ScoreSheet
                    activePlayers={visibleActivePlayers}
                    allPlayerCount={session.players.length}
                    hasSearch={Boolean(normalizedSearch)}
                    pricing={session.pricing}
                    shuttleColumns={shuttleColumns}
                    onRemovePlayer={removePlayer}
                    onSetPaid={setPaid}
                    onToggleShuttleMark={toggleShuttleMark}
                    onUpdatePlayer={updatePlayer}
                  />
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
                />
              )}
            </Paper>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

function ScoreSheet({
  activePlayers,
  allPlayerCount,
  hasSearch,
  pricing,
  shuttleColumns,
  onRemovePlayer,
  onSetPaid,
  onToggleShuttleMark,
  onUpdatePlayer
}: {
  activePlayers: Player[];
  allPlayerCount: number;
  hasSearch: boolean;
  pricing: SessionState["pricing"];
  shuttleColumns: number[];
  onRemovePlayer: (id: string) => void;
  onSetPaid: (id: string, paid: boolean) => void;
  onToggleShuttleMark: (id: string, column: number) => void;
  onUpdatePlayer: (id: string, updater: (player: Player) => Player) => void;
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
            activePlayers.map((player) => (
              <TableRow key={player.id} hover aria-label={player.name}>
                <TableCell className="stickyName playerCell">
                  <TextField
                    aria-label={`แก้ชื่อ ${player.name}`}
                    value={player.name}
                    onChange={(event) =>
                      onUpdatePlayer(player.id, (current) => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                    variant="standard"
                    fullWidth
                  />
                </TableCell>
                {shuttleColumns.map((column) => (
                  <TableCell key={column} align="center" className="shuttleCell">
                    {(() => {
                      const shuttleMark = getPlayerShuttleMarks(player)[column];
                      const checked = typeof shuttleMark === "number";
                      return (
                        <Checkbox
                          inputProps={{
                            "aria-label": checked
                              ? `${player.name} ช่องที่ ${column + 1} ลูก ${shuttleMark}`
                              : `${player.name} ช่องที่ ${column + 1}`
                          }}
                          checked={checked}
                          onChange={() => onToggleShuttleMark(player.id, column)}
                          icon={<SportsTennisIcon fontSize="small" />}
                          checkedIcon={
                            <span className="shuttleNumberIcon shuttleNumberIconChecked">
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
                    onChange={(event) => onSetPaid(player.id, event.target.checked)}
                  />
                </TableCell>
                <TableCell align="center">
                  <Tooltip title={`ลบ ${player.name}`}>
                    <IconButton
                      aria-label={`ลบ ${player.name}`}
                      color="error"
                      onClick={() => onRemovePlayer(player.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
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
            <Paper key={group.shuttleNumber} className="matchItem" elevation={0}>
              <Typography variant="h6" component="h3">
                ลูกที่ {group.shuttleNumber}
              </Typography>
              <Typography className="matchNames">{group.playerNames.join(" ")}</Typography>
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
  onSetPaid
}: {
  players: Player[];
  paidGroups: ReturnType<typeof groupPaidPlayersByDay>;
  hasSearch: boolean;
  onSetPaid: (id: string, paid: boolean) => void;
}) {
  return (
    <Box className="paidSummaryPanel" role="region" aria-label="รายการจ่ายแล้ว">
      <Typography variant="h5" component="h2">
        สรุปจ่ายแล้ว
      </Typography>
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

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Paper className="summaryStat" elevation={0}>
      <Chip label={label} size="small" />
      <Typography variant="h6" component="p">
        {value}
      </Typography>
    </Paper>
  );
}

function formatBaht(value: number): string {
  return bahtFormatter.format(value);
}

function formatDateKey(dateKey: string): string {
  return dateFormatter.format(new Date(`${dateKey}T00:00:00`));
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
