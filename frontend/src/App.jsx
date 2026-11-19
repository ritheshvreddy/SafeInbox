import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, getSessionToken, setSessionToken } from "./api";
import { requestGmailAccess } from "./googleAuth";
import { LABEL_STYLES, LABELS } from "./labels";
import AdminModal from "./components/AdminModal";
import ChatPanel from "./components/ChatPanel";
import EmailCard from "./components/EmailCard";
import Icon from "./components/Icon";
import InfoModal from "./components/InfoModal";
import LoginScreen from "./components/LoginScreen";
import SettingsModal from "./components/SettingsModal";
import Sidebar from "./components/Sidebar";

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
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function IconButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-full border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <Icon name={icon} className="h-5 w-5" />
    </button>
  );
}

function Banner({ tone, children, onClose }) {
  const tones = {
    red: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
    green: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
    amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  };
  return (
    <div className={`mb-4 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${tones[tone]}`} role="status">
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
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
      if (data.user.preferences?.theme) setTheme(data.user.preferences.theme);
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

  const counts = useMemo(() => {
    const result = { all: emails.length };
    LABELS.forEach((label) => {
      result[label] = emails.filter((email) => email.label === label).length;
    });
    return result;
  }, [emails]);
  const visible = filter === "all" ? emails : emails.filter((email) => email.label === filter);
  const shell = "min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100";
  const themeButton = (
    <IconButton icon={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggleTheme} />
  );

  if (booting) {
    return <div className={`${shell} flex items-center justify-center`}>Loading SafeInbox…</div>;
  }

  if (!user) {
    return (
      <div className={shell}>
        <header className="flex justify-end gap-2 p-4">
          <IconButton icon="info" label="About and privacy" onClick={() => setModal("info")} />
          {themeButton}
        </header>
        <LoginScreen
          onLogin={login}
          busy={signingIn}
          error={loginError}
          retentionDays={retentionDays}
          serverStatus={serverStatus}
        />
        {modal === "info" && <InfoModal signedIn={false} retentionDays={retentionDays} onClose={() => setModal(null)} />}
      </div>
    );
  }

  const firstName = (user.name || "").split(" ")[0];

  return (
    <div className={`${shell} md:flex`}>
      <Sidebar
        user={user}
        stats={stats}
        history={history}
        onLogout={logout}
        onOpenAdmin={() => setModal("admin")}
        onSelectHistory={selectHistory}
      />

      <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 md:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Hi {firstName}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {loading
                ? "Checking your inbox…"
                : `${emails.length} unread email${emails.length === 1 ? "" : "s"} analysed · sensitivity ${user.preferences.sensitivity}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadEmails()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white shadow hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
            >
              <Icon name="refresh" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh emails"}
            </button>
            <IconButton icon="gear" label="Settings" onClick={() => setModal("settings")} />
            <IconButton icon="info" label="About and privacy" onClick={() => setModal("info")} />
            {themeButton}
          </div>
        </div>

        {needsReconnect && (
          <Banner tone="amber">
            <span className="mr-2">Your Gmail connection expired (Google only allows about an hour at a time).</span>
            <button onClick={reconnect} className="font-semibold underline">
              Reconnect Gmail
            </button>
          </Banner>
        )}
        {error && (
          <Banner tone="red" onClose={() => setError("")}>
            {error}
          </Banner>
        )}
        {notice && (
          <Banner tone="green" onClose={() => setNotice("")}>
            {notice}
          </Banner>
        )}

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
          {["all", ...LABELS].map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${
                filter === key
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
              }`}
            >
              {key === "all" ? "All" : LABEL_STYLES[key].short} ({counts[key]})
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {visible.map((email) => (
            <EmailCard key={email.id} email={email} busy={Boolean(busyIds[email.id])} onAction={handleAction} />
          ))}
          {!loading && visible.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {emails.length === 0 ? "No unread emails in your inbox. Nice!" : "No emails in this category."}
            </div>
          )}
          {loading && emails.length === 0 && (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
              ))}
            </div>
          )}
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
