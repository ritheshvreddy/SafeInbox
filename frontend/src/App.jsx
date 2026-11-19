import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, getSessionToken, setSessionToken } from "./api";
import { requestGmailAccess } from "./googleAuth";
import { LABEL_STYLES } from "./labels";
import { box, btn, cx, input, muted, toneIcon } from "./ui";
import AdminModal from "./components/AdminModal";
import ChatPanel from "./components/ChatPanel";
import EmailCard from "./components/EmailCard";
import Icon from "./components/Icon";
import InfoModal from "./components/InfoModal";
import LoginScreen from "./components/LoginScreen";
import SettingsModal from "./components/SettingsModal";
import Sidebar from "./components/Sidebar";
import StatCards from "./components/StatCards";

const EMPTY_STATS = { spam: 0, suspicious: 0, safe: 0, phishing: 0 };
const ACTION_MESSAGES = {
  read: "Marked as read in Gmail.",
  delete: "Moved to Gmail's Trash.",
  report: "Reported as spam: moved to Gmail's Spam folder, and this sender is now blocked.",
  keep: "Marked as not spam: this sender is now trusted.",
};

function initialTheme() {
  try {
    const saved = localStorage.getItem("safeinbox.theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore unavailable storage
  }
  return "light"; // light mode is the default; dark mode only when the user picks it
}

function IconButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={btn.icon}>
      <Icon name={icon} className="h-5 w-5" />
    </button>
  );
}

const BANNER_ICONS = { info: "info", success: "check", warning: "alert", danger: "alert" };

function Banner({ kind = "info", children, onClose }) {
  return (
    <div className={cx(box(kind), "mb-4 flex items-start gap-3")} role="status">
      <Icon name={BANNER_ICONS[kind]} className={cx("mt-0.5 h-4 w-4 shrink-0", toneIcon[kind])} />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="opacity-50 hover:opacity-100">
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(initialTheme);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(() => Boolean(getSessionToken()));
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [busyIds, setBusyIds] = useState({});
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [retentionDays, setRetentionDays] = useState(30);
  const [serverStatus, setServerStatus] = useState("checking");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("safeinbox.theme", theme);
    } catch {
      // ignore unavailable storage
    }
  }, [theme]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const resetSession = useCallback((message = "") => {
    setSessionToken(null);
    setUser(null);
    setEmails([]);
    setStats(EMPTY_STATS);
    setHistory([]);
    setNeedsReconnect(false);
    setModal(null);
    setError("");
    setLoginError(message);
  }, []);

  const handleError = useCallback(
    (err) => {
      if (err instanceof ApiError && (err.code === "auth_required" || err.code === "session_expired")) {
        resetSession(err.message);
      } else if (err instanceof ApiError && err.code === "gmail_reauth") {
        setNeedsReconnect(true);
      } else {
        setError(err.message);
      }
    },
    [resetSession]
  );

  const loadHistory = useCallback(async () => {
    try {
      const data = await api("/api/history?limit=25");
      setHistory(data.items);
    } catch {
      // history is not critical
    }
  }, []);

  const loadEmails = useCallback(
    async ({ cached = false } = {}) => {
      setLoading(true);
      setError("");
      try {
        const data = await api(`/api/emails${cached ? "?cached=1" : ""}`);
        setEmails(data.emails);
        setStats(data.stats);
        if (!cached) setNeedsReconnect(false);
        if (data.failed > 0) setError(`${data.failed} email(s) couldn't be loaded from Gmail. Try Refresh.`);
        loadHistory();
        return data;
      } catch (err) {
        handleError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [handleError, loadHistory]
  );

  // Wake the backend early: on free hosting it sleeps when idle and can take up to a minute to start.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const slowTimer = setTimeout(() => !cancelled && setServerStatus((s) => (s === "checking" ? "waking" : s)), 2500);
    const check = async () => {
      try {
        const health = await api("/api/health");
        if (cancelled) return;
        setRetentionDays(health.retentionDays ?? 30);
        setServerStatus("ok");
      } catch {
        if (cancelled) return;
        attempts += 1;
        if (attempts < 15) {
          setServerStatus("waking");
          setTimeout(check, 5000);
        } else {
          setServerStatus("down");
        }
      }
    };
    check();
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, []);

  // Restore the session after a page reload.
  useEffect(() => {
    let cancelled = false;
    if (!getSessionToken()) return undefined;
    (async () => {
      try {
        const data = await api("/api/auth/me");
        if (cancelled) return;
        setUser(data.user);
        setBooting(false);
        if (data.gmailConnected) loadEmails();
        else {
          setNeedsReconnect(true);
          loadEmails({ cached: true });
        }
      } catch (err) {
        if (!cancelled) {
          setBooting(false);
          if (err.code === "auth_required" || err.code === "session_expired") handleError(err);
          else setLoginError(err.message); // e.g. backend not running - shown on the login screen
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleError, loadEmails]);

  async function login() {
    setSigningIn(true);
    setLoginError("");
    try {
      const accessToken = await requestGmailAccess();
      const data = await api("/api/auth/google", { method: "POST", body: { access_token: accessToken } });
      setSessionToken(data.sessionToken);
      setUser(data.user);
      await loadEmails();
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setSigningIn(false);
    }
  }

  async function reconnect() {
    try {
      const accessToken = await requestGmailAccess({ hint: user.email });
      await api("/api/auth/gmail-token", { method: "POST", body: { access_token: accessToken } });
      setNeedsReconnect(false);
      await loadEmails();
    } catch (err) {
      if (err instanceof ApiError) handleError(err);
      else setError(err.message);
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // the local session is cleared either way
    }
    resetSession();
  }

  async function handleAction(email, action) {
    setBusyIds((current) => ({ ...current, [email.id]: true }));
    try {
      await api(`/api/emails/${email.id}/action`, { method: "POST", body: { action } });
      setNotice(ACTION_MESSAGES[action]);
      await loadEmails({ cached: true });
    } catch (err) {
      handleError(err);
    } finally {
      setBusyIds((current) => {
        const next = { ...current };
        delete next[email.id];
        return next;
      });
    }
  }

  async function savePreferences(changes) {
    const previous = user.preferences;
    const data = await api("/api/preferences", { method: "PUT", body: changes });
    setUser((current) => ({ ...current, preferences: data.preferences }));
    setNotice("Settings saved.");
    // More emails per refresh needs a real Gmail fetch; other settings only re-score the cached emails.
    await loadEmails({ cached: data.preferences.max_emails === previous.max_emails });
  }

  const preferencesChanged = useCallback(async () => {
    const data = await api("/api/preferences");
    setUser((current) => ({ ...current, preferences: data.preferences }));
    await loadEmails({ cached: true });
  }, [loadEmails]);

  const refreshFromChat = useCallback(async () => {
    const data = await loadEmails();
    if (!data) return "I couldn't fetch your emails - see the message at the top of the page.";
    const { spam, suspicious, safe } = data.stats;
    return `Done: ${data.emails.length} unread emails - ${spam} likely spam, ${suspicious} suspicious, ${safe} likely safe.`;
  }, [loadEmails]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (user) api("/api/preferences", { method: "PUT", body: { theme: next } }).catch(() => {});
  }

  function selectHistory(item) {
    if (emails.some((email) => email.id === item.id)) {
      setFilter("all");
      setTimeout(() => document.getElementById(`email-${item.id}`)?.scrollIntoView({ behavior: "smooth" }), 50);
    } else {
      window.open(item.gmailUrl, "_blank", "noopener,noreferrer");
    }
  }

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return emails.filter(
      (email) =>
        (filter === "all" || email.label === filter) &&
        (!term || `${email.senderName} ${email.senderEmail} ${email.subject} ${email.summary}`.toLowerCase().includes(term))
    );
  }, [emails, filter, query]);
  const shell = "min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100";
  const themeButton = (
    <IconButton icon={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggleTheme} />
  );

  if (booting) {
    return <div className={`${shell} flex items-center justify-center`}>Loading SafeInbox…</div>;
  }

  if (!user) {
    return (
      <div className={shell}>
        <LoginScreen
          onLogin={login}
          busy={signingIn}
          error={loginError}
          retentionDays={retentionDays}
          serverStatus={serverStatus}
          topRight={
            <>
              <IconButton icon="info" label="About and privacy" onClick={() => setModal("info")} />
              {themeButton}
            </>
          }
        />
        {modal === "info" && <InfoModal signedIn={false} retentionDays={retentionDays} onClose={() => setModal(null)} />}
      </div>
    );
  }

  const firstName = (user.name || "").split(" ")[0];
  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  const filterName = filter === "all" ? "All emails" : `${LABEL_STYLES[filter].short} emails`;

  return (
    <div className={`${shell} md:flex`}>
      <Sidebar
        user={user}
        unread={emails.length}
        history={history}
        onLogout={logout}
        onOpenAdmin={() => setModal("admin")}
        onOpenSettings={() => setModal("settings")}
        onOpenInfo={() => setModal("info")}
        onSelectHistory={selectHistory}
      />

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
                <span className="sm:hidden">Hi {firstName}</span>
                <span className="hidden sm:inline">Good to see you, {firstName}</span>
              </h1>
              <p className={cx("text-xs", muted)}>{today}</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="md:hidden">
                <IconButton icon="gear" label="Settings" onClick={() => setModal("settings")} />
              </span>
              <span className="md:hidden">
                <IconButton icon="info" label="About and privacy" onClick={() => setModal("info")} />
              </span>
              {themeButton}
              <button onClick={() => loadEmails()} disabled={loading} className={cx(btn.primary, "ml-2")}>
                <Icon name="refresh" className={cx("h-4 w-4", loading && "animate-spin")} />
                <span className="hidden sm:inline">{loading ? "Checking…" : "Refresh"}</span>
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-8">
          {needsReconnect && (
            <Banner kind="warning">
              <span className="mr-2">Your Gmail connection expired (Google only allows about an hour at a time).</span>
              <button onClick={reconnect} className="font-semibold underline underline-offset-2">
                Reconnect Gmail
              </button>
            </Banner>
          )}
          {error && (
            <Banner kind="danger" onClose={() => setError("")}>
              {error}
            </Banner>
          )}
          {notice && (
            <Banner kind="success" onClose={() => setNotice("")}>
              {notice}
            </Banner>
          )}
          {stats.phishing > 0 && (
            <Banner kind="danger">
              <strong>{stats.phishing}</strong> email{stats.phishing === 1 ? " has" : "s have"} phishing warning signs. Don't
              click their links or share passwords.
            </Banner>
          )}

          <StatCards stats={stats} filter={filter} onFilter={setFilter} />

          <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">{filterName}</h2>
              <p className={cx("text-xs", muted)}>
                {visible.length} shown · {user.preferences.sensitivity} sensitivity
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sender or subject"
                className={cx(input, "pl-9")}
                aria-label="Search emails"
              />
            </div>
          </div>

          <div className="space-y-4">
            {visible.map((email) => (
              <EmailCard key={email.id} email={email} busy={Boolean(busyIds[email.id])} onAction={handleAction} />
            ))}
            {!loading && visible.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900/40">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <Icon name="check" className="h-6 w-6" />
                </span>
                <p className="mt-3 font-medium text-slate-900 dark:text-white">
                  {emails.length === 0 ? "Inbox zero - no unread emails" : "Nothing matches"}
                </p>
                <p className={cx("mt-1 text-sm", muted)}>
                  {emails.length === 0 ? "Click Refresh to check again." : "Try another filter or search."}
                </p>
              </div>
            )}
            {loading &&
              emails.length === 0 &&
              [0, 1, 2].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900" />
              ))}
          </div>
        </div>
      </main>

      <ChatPanel onRefresh={refreshFromChat} onPreferencesChanged={preferencesChanged} />

      {modal === "settings" && (
        <SettingsModal preferences={user.preferences} onSave={savePreferences} onClose={() => setModal(null)} />
      )}
      {modal === "info" && (
        <InfoModal
          signedIn
          retentionDays={retentionDays}
          onClose={() => setModal(null)}
          onAccountDeleted={() => resetSession("Your account and data were deleted.")}
        />
      )}
      {modal === "admin" && <AdminModal onClose={() => setModal(null)} onModelChanged={() => loadEmails({ cached: true })} />}
    </div>
  );
}
