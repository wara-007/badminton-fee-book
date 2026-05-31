"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Container,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
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
import LightModeIcon from "@mui/icons-material/LightMode";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";
import VisibilityIcon from "@mui/icons-material/Visibility";
import LogoutIcon from "@mui/icons-material/Logout";
import { createInitialSession } from "@/lib/session";
import {
  deleteRemoteSession,
  hasSupabaseConfig,
  listRemoteSessions,
  saveRemoteSession
} from "@/lib/supabase-session";

const AUTH_STORAGE_KEY = "badminton-fee-book.auth";
const ROOM_STORAGE_KEY = "badminton-fee-book.room";
const SESSION_PREFIX = "badminton-fee-book.session.";

type AuthSession = {
  role: string;
};


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
      if (hasSupabaseConfig) {
        try {
          const remoteRooms = await listRemoteSessions();
          const remoteIds = remoteRooms.map((row) => row.id);
          const merged = new Set([...localRooms, ...remoteIds]);
          setRooms(Array.from(merged));
        } catch {
          setRooms(localRooms);
        }
      } else {
        setRooms(localRooms);
      }
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
