import Icon from "./Icon";

const FEATURES = [
  ["shield", "Spam score for every unread email, with the reasons behind it"],
  ["alert", "Phishing warnings for links that hide where they really go"],
  ["mail", "Short summaries so you know what an email says without opening it"],
  ["chat", "Ask the assistant: \"summary\", \"show spam\", \"any phishing?\""],
];

export default function LoginScreen({ onLogin, busy, error, retentionDays }) {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-blue-600 p-2.5 text-white">
            <Icon name="shield" className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Welcome to SafeInbox</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Your AI spam and phishing checker for Gmail</p>
          </div>
        </div>

        <ul className="mt-6 space-y-3">
          {FEATURES.map(([icon, text]) => (
            <li key={text} className="flex gap-3 text-sm">
              <Icon name={icon} className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
              {text}
            </li>
          ))}
        </ul>

        <button
          onClick={onLogin}
          disabled={busy}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
        >
          <Icon name="mail" className="h-5 w-5" />
          {busy ? "Signing in…" : "Login with Gmail"}
        </button>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>
        )}

        <p className="mt-6 text-xs leading-5 text-slate-500 dark:text-slate-400">
          By signing in you allow SafeInbox to read your unread Gmail emails and to mark, move or delete them when you
          click the buttons. Email content is stored encrypted (AES-256), deleted automatically after {retentionDays} days,
          and you can download or delete your data at any time from the ⓘ menu. Logging out revokes access.
        </p>
      </div>
    </main>
  );
}
