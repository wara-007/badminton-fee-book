"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import styles from "./support-preview.module.css";

type InboxStatus = "waiting" | "assigned" | "answered";
type Filter = "all" | InboxStatus;

type Admin = {
  role: "admin" | "admin2";
  displayName: string;
};

type TicketSummary = {
  id: string;
  name: string;
  preview: string;
  latestAt: string;
  unread: number;
  inboxStatus: InboxStatus;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
};

type TicketDetail = {
  id: string;
  requester_display_name: string;
  status: "open" | "closed";
  assigned_admin_user_id: string | null;
  assigned_admin_display_name: string | null;
  created_at: string;
  updated_at: string;
};

type SupportMessage = {
  id: number;
  sender_type: "user" | "admin";
  sender_line_user_id: string;
  body: string;
  created_at: string;
};

type Counts = Record<Filter, number>;

const initialCounts: Counts = {
  all: 0,
  waiting: 0,
  assigned: 0,
  answered: 0,
};

const statusCopy: Record<InboxStatus, string> = {
  waiting: "รอตอบ",
  assigned: "กำลังดูแล",
  answered: "ตอบแล้ว",
};

const timeFormatter = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

async function readApiError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

function getInitials(name: string): string {
  return [...name.trim()][0]?.toLocaleUpperCase("th-TH") ?? "?";
}

function formatRelativeTime(value: string): string {
  const milliseconds = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.`;
  return dateTimeFormatter.format(new Date(value));
}

function getMessageDay(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "วันนี้";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function SupportPreviewPage() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [counts, setCounts] = useState<Counts>(initialCounts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [composer, setComposer] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadTickets = useCallback(
    async (silent = false) => {
      if (!admin) return;
      if (!silent) setLoadingTickets(true);
      try {
        const response = await fetch(
          `/api/support/tickets${search ? `?search=${encodeURIComponent(search)}` : ""}`,
          { cache: "no-store" },
        );
        if (response.status === 401) {
          setAdmin(null);
          return;
        }
        if (!response.ok) throw new Error(await readApiError(response));
        const data = (await response.json()) as {
          tickets: TicketSummary[];
          counts: Counts;
        };
        setTickets(data.tickets);
        setCounts(data.counts);
        setSelectedId((current) => {
          if (current && data.tickets.some((item) => item.id === current)) {
            return current;
          }
          return data.tickets[0]?.id ?? null;
        });
      } catch (loadError) {
        if (!silent) {
          setError(loadError instanceof Error ? loadError.message : "โหลด Ticket ไม่สำเร็จ");
        }
      } finally {
        if (!silent) setLoadingTickets(false);
      }
    },
    [admin, search],
  );

  const loadConversation = useCallback(
    async (ticketId: string, silent = false) => {
      if (!admin) return;
      if (!silent) setLoadingConversation(true);
      try {
        const response = await fetch(`/api/support/tickets/${ticketId}`, {
          cache: "no-store",
        });
        if (response.status === 401) {
          setAdmin(null);
          return;
        }
        if (!response.ok) throw new Error(await readApiError(response));
        const data = (await response.json()) as {
          ticket: TicketDetail;
          messages: SupportMessage[];
        };
        setTicket(data.ticket);
        setMessages(data.messages);
      } catch (loadError) {
        if (!silent) {
          setError(loadError instanceof Error ? loadError.message : "โหลดข้อความไม่สำเร็จ");
        }
      } finally {
        if (!silent) setLoadingConversation(false);
      }
    },
    [admin],
  );

  useEffect(() => {
    void fetch("/api/support/auth", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { admin: Admin };
      })
      .then((data) => setAdmin(data?.admin ?? null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      setMessages([]);
      return;
    }
    void loadConversation(selectedId);
  }, [loadConversation, selectedId]);

  useEffect(() => {
    if (!admin) return;
    const interval = window.setInterval(() => {
      void loadTickets(true);
      if (selectedId) void loadConversation(selectedId, true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [admin, loadConversation, loadTickets, selectedId]);

  const visibleTickets = useMemo(
    () =>
      tickets.filter(
        (item) => filter === "all" || item.inboxStatus === filter,
      ),
    [filter, tickets],
  );
  const selectedSummary = tickets.find((item) => item.id === selectedId) ?? null;
  const currentAdminLineId =
    admin?.role === "admin"
      ? "UWEB_ADMIN"
      : admin?.role === "admin2"
        ? "UWEB_ADMIN2"
        : null;
  const isOwnedByCurrentAdmin =
    Boolean(currentAdminLineId) &&
    ticket?.assigned_admin_user_id === currentAdminLineId;

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    const response = await fetch("/api/support/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      setLoginError(await readApiError(response));
      return;
    }
    const data = (await response.json()) as { admin: Admin };
    setAdmin(data.admin);
    setPassword("");
  }

  async function logout() {
    await fetch("/api/support/auth", { method: "DELETE" });
    setAdmin(null);
    setTickets([]);
    setTicket(null);
    setMessages([]);
  }

  async function runAction(
    action: "claim" | "reply" | "close",
    message?: string,
  ) {
    if (!selectedId) return;
    if (
      action === "close" &&
      !window.confirm(`ปิด Ticket ของ ${ticket?.requester_display_name ?? "ลูกค้า"} ใช่ไหม`)
    ) {
      return;
    }
    setActionLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/support/tickets/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, message }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      if (action === "reply") {
        setComposer("");
        setNotice("ส่งข้อความให้ลูกค้าแล้ว");
      } else if (action === "claim") {
        setNotice("รับเรื่องแล้ว คุณสามารถตอบลูกค้าได้");
      } else {
        setNotice("ปิด Ticket แล้ว");
      }
      await loadTickets(true);
      if (action !== "close") await loadConversation(selectedId, true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setActionLoading(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!composer.trim()) return;
    void runAction("reply", composer.trim());
  }

  if (authLoading) {
    return (
      <main className={styles.statePage}>
        <div className={styles.loader} />
        <p>กำลังเปิดกล่องข้อความ…</p>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className={styles.loginPage}>
        <form className={styles.loginPanel} onSubmit={login}>
          <div>
            <p className={styles.brand}>แล้วแต่ปุ๊</p>
            <h1>กล่องข้อความแอดมิน</h1>
            <p className={styles.loginDescription}>
              ใช้บัญชีแอดมินเดียวกับสมุดค่าตีแบด
            </p>
          </div>
          <label>
            ชื่อผู้ใช้
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label>
            รหัสผ่าน
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {loginError && <p className={styles.formError}>{loginError}</p>}
          <button className={styles.primaryButton} type="submit">
            เข้าสู่กล่องข้อความ
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.brand}>แล้วแต่ปุ๊</p>
          <h1>ข้อความลูกค้า</h1>
        </div>
        <div className={styles.admin}>
          <span className={styles.onlineDot} />
          <span>{admin.displayName}</span>
          <button className={styles.logoutButton} onClick={() => void logout()} type="button">
            ออกจากระบบ
          </button>
        </div>
      </header>

      {(error || notice) && (
        <div className={error ? styles.errorBanner : styles.noticeBanner}>
          <span>{error || notice}</span>
          <button
            aria-label="ปิดข้อความแจ้งเตือน"
            onClick={() => {
              setError("");
              setNotice("");
            }}
            type="button"
          >
            ปิด
          </button>
        </div>
      )}

      <section className={styles.workspace}>
        <aside className={styles.inbox}>
          <div className={styles.inboxHeader}>
            <div>
              <h2>กล่องข้อความ</h2>
              <p>{counts.all} เรื่องที่เปิดอยู่</p>
            </div>
          </div>

          <form className={styles.searchForm} onSubmit={submitSearch}>
            <input
              aria-label="ค้นหาลูกค้า"
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="ค้นหาชื่อลูกค้า"
              value={searchDraft}
            />
            <button className={styles.searchButton} type="submit">
              ค้นหา
            </button>
          </form>

          <nav className={styles.filters} aria-label="กรองสถานะ Ticket">
            {([
              ["all", "ทั้งหมด"],
              ["waiting", "รอตอบ"],
              ["assigned", "กำลังดูแล"],
              ["answered", "ตอบแล้ว"],
            ] as Array<[Filter, string]>).map(([value, label]) => (
              <button
                className={filter === value ? styles.filterActive : styles.filter}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {label}
                <span>{counts[value]}</span>
              </button>
            ))}
          </nav>

          <div className={styles.ticketList}>
            {loadingTickets ? (
              <div className={styles.listState}>กำลังโหลด Ticket…</div>
            ) : visibleTickets.length === 0 ? (
              <div className={styles.listState}>
                <strong>ไม่พบ Ticket</strong>
                <span>ลองเปลี่ยนตัวกรองหรือค้นหาชื่ออื่น</span>
              </div>
            ) : (
              visibleTickets.map((item) => (
                <button
                  className={`${styles.ticket} ${
                    selectedId === item.id ? styles.ticketSelected : ""
                  }`}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  type="button"
                >
                  <span className={styles.avatar}>{getInitials(item.name)}</span>
                  <span className={styles.ticketBody}>
                    <span className={styles.ticketTopline}>
                      <strong>{item.name}</strong>
                      <small>{formatRelativeTime(item.latestAt)}</small>
                    </span>
                    <span className={styles.preview}>{item.preview}</span>
                    <span className={styles.ticketMeta}>
                      <span className={`${styles.status} ${styles[item.inboxStatus]}`}>
                        {statusCopy[item.inboxStatus]}
                      </span>
                      {item.ownerName && <span>ผู้ดูแล: {item.ownerName}</span>}
                    </span>
                  </span>
                  {item.unread > 0 && <span className={styles.unread}>{item.unread}</span>}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className={styles.conversation}>
          {!selectedId || !ticket || !selectedSummary ? (
            <div className={styles.conversationEmpty}>
              <strong>เลือก Ticket เพื่อดูบทสนทนา</strong>
              <span>ข้อความใหม่จาก LINE Official จะแสดงที่นี่</span>
            </div>
          ) : (
            <>
              <header className={styles.conversationHeader}>
                <div className={styles.person}>
                  <span className={styles.avatarLarge}>
                    {getInitials(ticket.requester_display_name)}
                  </span>
                  <div>
                    <h2>{ticket.requester_display_name}</h2>
                    <p>
                      Ticket เปิดอยู่ · เริ่ม {dateTimeFormatter.format(new Date(ticket.created_at))} น.
                    </p>
                  </div>
                </div>
                <div className={styles.actions}>
                  <span className={`${styles.status} ${styles[selectedSummary.inboxStatus]}`}>
                    {statusCopy[selectedSummary.inboxStatus]}
                  </span>
                  <button
                    className={styles.secondaryButton}
                    disabled={actionLoading}
                    onClick={() => void runAction("close")}
                    type="button"
                  >
                    ปิดเรื่อง
                  </button>
                </div>
              </header>

              <div className={styles.ownerBar}>
                <div>
                  <strong>
                    {ticket.assigned_admin_display_name
                      ? `ผู้ดูแล: ${ticket.assigned_admin_display_name}`
                      : "ยังไม่มีผู้ดูแล"}
                  </strong>
                  <span>
                    {ticket.assigned_admin_display_name
                      ? "ข้อความตอบกลับจะบันทึกใน Ticket นี้"
                      : "รับเรื่องเพื่อให้แอดมินคนอื่นทราบว่าคุณกำลังตอบ"}
                  </span>
                </div>
                {!ticket.assigned_admin_user_id && (
                  <button
                    className={styles.primaryButton}
                    disabled={actionLoading}
                    onClick={() => void runAction("claim")}
                    type="button"
                  >
                    รับเรื่อง
                  </button>
                )}
              </div>

              <div className={styles.messages}>
                {loadingConversation ? (
                  <div className={styles.messageState}>กำลังโหลดข้อความ…</div>
                ) : (
                  messages.map((message, index) => {
                    const previous = messages[index - 1];
                    const showDay =
                      !previous ||
                      new Date(previous.created_at).toDateString() !==
                        new Date(message.created_at).toDateString();
                    const showNewMarker =
                      selectedSummary.unread > 0 &&
                      index === messages.length - selectedSummary.unread;
                    return (
                      <div key={message.id}>
                        {showDay && (
                          <div className={styles.dayDivider}>
                            {getMessageDay(message.created_at)}
                          </div>
                        )}
                        {showNewMarker && (
                          <div className={styles.newMarker}>
                            <span>
                              {selectedSummary.unread} ข้อความใหม่ ยังไม่ได้ตอบ
                            </span>
                          </div>
                        )}
                        <div
                          className={
                            message.sender_type === "admin"
                              ? styles.adminMessage
                              : styles.customerMessage
                          }
                        >
                          <p>{message.body}</p>
                          {message.sender_type === "admin" && (
                            <span>ตอบโดยแอดมิน</span>
                          )}
                          <time>
                            {timeFormatter.format(new Date(message.created_at))}
                          </time>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form className={styles.composer} onSubmit={submitReply}>
                <textarea
                  aria-label="ข้อความตอบกลับ"
                  disabled={!isOwnedByCurrentAdmin || actionLoading}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder={
                    isOwnedByCurrentAdmin
                      ? "พิมพ์ข้อความตอบกลับ…"
                      : ticket.assigned_admin_display_name
                        ? `กำลังดูแลโดย ${ticket.assigned_admin_display_name}`
                        : "กดรับเรื่องก่อนตอบลูกค้า"
                  }
                  value={composer}
                />
                <div className={styles.composerFooter}>
                  <span>ส่งผ่าน แล้วแต่ปุ๊ Official</span>
                  <button
                    className={styles.primaryButton}
                    disabled={!isOwnedByCurrentAdmin || !composer.trim() || actionLoading}
                    type="submit"
                  >
                    {actionLoading ? "กำลังส่ง…" : "ส่งข้อความ"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>

        <aside className={styles.details}>
          <h2>รายละเอียด</h2>
          {selectedSummary && ticket ? (
            <>
              <dl>
                <div>
                  <dt>สถานะ</dt>
                  <dd className={`${styles.status} ${styles[selectedSummary.inboxStatus]}`}>
                    {statusCopy[selectedSummary.inboxStatus]}
                  </dd>
                </div>
                <div>
                  <dt>ผู้ดูแล</dt>
                  <dd>{ticket.assigned_admin_display_name ?? "ยังไม่มี"}</dd>
                </div>
                <div>
                  <dt>ข้อความใหม่</dt>
                  <dd>{selectedSummary.unread} ข้อความ</dd>
                </div>
                <div>
                  <dt>ช่องทาง</dt>
                  <dd>LINE Official</dd>
                </div>
              </dl>
              <div className={styles.rule}>
                <strong>หนึ่งคน หนึ่ง Ticket</strong>
                <p>ข้อความใหม่จะต่อในเรื่องนี้จนกว่าแอดมินจะกดปิดเรื่อง</p>
              </div>
            </>
          ) : (
            <p className={styles.detailsEmpty}>ยังไม่ได้เลือก Ticket</p>
          )}
        </aside>
      </section>
    </main>
  );
}
