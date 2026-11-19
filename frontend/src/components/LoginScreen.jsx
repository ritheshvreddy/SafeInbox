import { box, btn, cx, muted, toneIcon } from "../ui";
import Icon from "./Icon";
import Logo from "./Logo";

const FEATURES = [
  ["shield", "Spam score and the reasons behind it", "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"],
  ["alert", "Warnings for phishing links", "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"],
  ["mail", "Short summaries of every email", "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"],
  ["chat", "An assistant for your inbox", "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"],
];

const PREVIEW = [
  // Illustrative examples with fictional senders.
  { from: "Northwind Bank Alerts", subject: "Unusual sign-in attempt on your account", label: "Spam", score: "94%", tint: "bg-rose-400/20 text-rose-100 ring-rose-300/30", avatar: "bg-white/15" },
  { from: "Brightway Courier", subject: "Your parcel is waiting", label: "Suspicious", score: "46%", tint: "bg-amber-400/20 text-amber-100 ring-amber-300/30", avatar: "bg-white/15" },
  { from: "Priya Raman", subject: "Design review moved to Friday", label: "Safe", score: "3%", tint: "bg-emerald-400/20 text-emerald-100 ring-emerald-300/30", avatar: "bg-white/15" },
];

function BrandPanel({ retentionDays }) {
  return (
    <section className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex lg:flex-col">
      <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-violet-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />

      <Logo size={36} nameClassName="text-xl text-white" />

      <div className="relative my-auto max-w-lg">
        <h2 className="text-4xl leading-tight font-semibold tracking-tight">Know which emails deserve your attention.</h2>
        <p className="mt-4 text-lg leading-8 text-indigo-100">
          SafeInbox checks your unread Gmail for spam and phishing, explains every decision and sums each email up in a
          sentence or two.
        </p>

        <div className="mt-10 space-y-2.5 rounded-2xl border border-white/15 bg-white/10 p-3 shadow-2xl shadow-indigo-950/30 backdrop-blur">
          {PREVIEW.map((row) => (
            <div key={row.subject} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
              <span className={cx("flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold", row.avatar)}>
                {row.from.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.from}</p>
                <p className="truncate text-xs text-indigo-200">{row.subject}</p>
              </div>
              <span className={cx("rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", row.tint)}>
                {row.label} · {row.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="relative flex items-center gap-2 text-sm text-indigo-200">
        <Icon name="lock" className="h-4 w-4" />
        Encrypted with AES-256 · deleted after {retentionDays} days · you stay in control
      </p>
    </section>
  );
}

export default function LoginScreen({ onLogin, busy, error, retentionDays, serverStatus, topRight }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel retentionDays={retentionDays} />

      <section className="flex flex-col">
        <div className="flex justify-end gap-1 p-4">{topRight}</div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <span className="lg:hidden">
              <Logo size={44} withName={false} />
            </span>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white lg:mt-0">
              Sign in to SafeInbox
            </h1>
            <p className={cx("mt-1.5 text-sm", muted)}>Use the Google account whose inbox you want to check.</p>

            {serverStatus === "waking" && (
              <div className={cx(box("info"), "mt-6 flex gap-2.5")}>
                <Icon name="refresh" className={cx("mt-0.5 h-4 w-4 shrink-0 animate-spin", toneIcon.info)} />
                <span>Starting the server… The free hosting plan sleeps when idle, so this can take up to a minute.</span>
              </div>
            )}
            {serverStatus === "down" && (
              <div className={cx(box("warning"), "mt-6")}>The server isn't responding right now. Please try again shortly.</div>
            )}

            <button onClick={onLogin} disabled={busy} className={cx(btn.primary, "mt-6 w-full py-3 text-[15px]")}>
              <Icon name="mail" className="h-5 w-5" />
              {busy ? "Signing in…" : "Continue with Gmail"}
            </button>
            {error && <div className={cx(box("danger"), "mt-3")}>{error}</div>}

            <div className={cx(box("warning"), "mt-4")}>
              <p className="flex items-center gap-2 font-semibold">
                <Icon name="alert" className={cx("h-4 w-4", toneIcon.warning)} />
                Seeing "Google hasn't verified this app"?
              </p>
              <p className="mt-1 leading-6">
                That's expected for this student project. Click <strong>Advanced</strong>, then{" "}
                <strong>Go to {window.location.host} (unsafe)</strong>, and tick the box that lets SafeInbox read and
                change your Gmail.
              </p>
            </div>

            <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURES.map(([icon, text, tint]) => (
                <li key={text} className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                  <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tint)}>
                    <Icon name={icon} className="h-4 w-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>

            <p className={cx("mt-8 text-xs leading-5", muted)}>
              By continuing you allow SafeInbox to read your unread Gmail emails and to mark, move or delete them when you
              click the buttons. Email content is stored encrypted and deleted after {retentionDays} days. You can download
              or delete your data any time. Logging out revokes access.
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
        </div>
      </section>
    </div>
  );
}
