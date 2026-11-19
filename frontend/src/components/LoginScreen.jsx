import { btn, card, cx, muted, notice } from "../ui";
import Icon from "./Icon";
import Logo from "./Logo";

const FEATURES = [
  ["shield", "A spam score for every unread email, with the reasons behind it"],
  ["alert", "Warnings for links that hide where they really go"],
  ["mail", "Short summaries, so you know what an email says without opening it"],
  ["chat", "An assistant: ask \"summary\", \"show spam\" or \"any phishing?\""],
];

export default function LoginScreen({ onLogin, busy, error, retentionDays, serverStatus }) {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 pb-12">
      <div className={cx(card, "w-full max-w-md p-8 shadow-sm")}>
        <Logo size={48} withName={false} />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Welcome to SafeInbox</h1>
        <p className={cx("mt-1 text-sm", muted)}>Your AI spam and phishing checker for Gmail.</p>

        <ul className="mt-6 space-y-3">
          {FEATURES.map(([icon, text]) => (
            <li key={text} className="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
              <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              {text}
            </li>
          ))}
        </ul>

        {serverStatus === "waking" && (
          <p className={cx(notice, "mt-6")}>
            Starting the server… The free hosting plan sleeps when nobody is using it, so the first visit can take up to a
            minute.
          </p>
        )}
        {serverStatus === "down" && (
          <p className={cx(notice, "mt-6")}>The SafeInbox server isn't responding right now. Please try again in a minute.</p>
        )}

        <button onClick={onLogin} disabled={busy} className={cx(btn.primary, "mt-7 w-full py-2.5 text-base")}>
          <Icon name="mail" className="h-5 w-5" />
          {busy ? "Signing in…" : "Login with Gmail"}
        </button>
        {error && <p className={cx(notice, "mt-3 font-medium text-slate-900 dark:text-white")}>{error}</p>}

        <div className={cx(notice, "mt-4")}>
          <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
            <Icon name="alert" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Seeing "Google hasn't verified this app"?
          </p>
          <p className="mt-1 leading-6">
            That's expected - SafeInbox is a student project that hasn't been through Google's paid app review. Click{" "}
            <strong>Advanced</strong>, then <strong>Go to {window.location.host} (unsafe)</strong>, and tick the box that
            lets SafeInbox read and change your Gmail.
          </p>
        </div>

        <p className={cx("mt-6 text-xs leading-5", muted)}>
          By signing in you allow SafeInbox to read your unread Gmail emails and to mark, move or delete them when you click
          the buttons. Email content is stored encrypted (AES-256), deleted automatically after {retentionDays} days, and you
          can download or delete your data at any time from the ⓘ menu. Logging out revokes access.
        </p>
        <p className={cx("mt-3 text-xs", muted)}>
          <a href="/privacy" className="hover:text-indigo-600 hover:underline">
            Privacy Policy
          </a>
          {" · "}
          <a href="/terms" className="hover:text-indigo-600 hover:underline">
            Terms of Service
          </a>
        </p>
      </div>
    </main>
  );
}
