import { useState } from "react";
import Icon from "./Icon";
import { LABEL_STYLES, formatDate, percent } from "../labels";

function ActionButton({ icon, children, onClick, disabled, tone = "neutral" }) {
  const tones = {
    neutral:
      "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700",
    blue: "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
    green:
      "border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10",
    amber: "border-amber-600 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10",
    red: "border-red-600 bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-wait disabled:opacity-50 ${tones[tone]}`}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

function PhishingWarning({ phishing }) {
  if (!["medium", "high"].includes(phishing.risk)) return null;
  const high = phishing.risk === "high";
  return (
    <div
      className={`mt-3 rounded-lg border p-3 text-sm ${
        high
          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
      }`}
    >
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="alert" />
        {high ? "Possible phishing - don't click links or share passwords" : "Be careful with the links in this email"}
      </p>
      <ul className="mt-1.5 space-y-1 pl-6">
        {phishing.sender.map((finding) => (
          <li key={finding.reason} className="list-disc">
            {finding.reason}
          </li>
        ))}
        {phishing.links.slice(0, 4).map((link) => (
          <li key={link.url} className="list-disc break-words">
            <span className="font-mono text-xs">{link.host || link.url}</span>: {link.reasons.join("; ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EmailCard({ email, busy, onAction }) {
  const [showBody, setShowBody] = useState(false);
  const style = LABEL_STYLES[email.label];

  return (
    <article
      id={`email-${email.id}`}
      className={`scroll-mt-24 rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/70 sm:p-5 ${style.accent}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{email.senderName || email.senderEmail}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {email.senderEmail} · {formatDate(email.receivedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {email.senderStatus === "trusted" && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              Trusted sender
            </span>
          )}
          {email.senderStatus === "blocked" && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
              Reported sender
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.badge}`}>
            {email.label} · {percent(email.spamScore)}
          </span>
        </div>
      </header>

      <h3 className="mt-2 font-medium text-slate-900 dark:text-white">{email.subject}</h3>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{email.description}</p>

      <PhishingWarning phishing={email.phishing} />

      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900/60">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Summary</p>
        <p className="text-slate-800 dark:text-slate-200">{email.summary || email.snippet || "(no text)"}</p>
      </div>

      <div className="mt-3 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Why</p>
        <p className="text-slate-700 dark:text-slate-300">{email.reason}</p>
        {email.signals.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {email.signals.map((signal) => (
              <li key={signal.text} className="flex gap-2 text-slate-600 dark:text-slate-400">
                <span className={signal.direction === "up" ? "text-red-500" : "text-emerald-500"}>
                  {signal.direction === "up" ? "▲" : "▼"}
                </span>
                {signal.text}
              </li>
            ))}
          </ul>
        )}
        {(email.spamWords.length > 0 || email.hamWords.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {email.spamWords.map((word) => (
              <span
                key={`s-${word}`}
                title="Appeared mostly in spam during training"
                className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
              >
                ▲ {word}
              </span>
            ))}
            {email.hamWords.map((word) => (
              <span
                key={`h-${word}`}
                title="Appeared mostly in normal emails during training"
                className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
              >
                ▼ {word}
              </span>
            ))}
          </div>
        )}
      </div>

      {showBody && (
        <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 font-sans text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {email.body || email.snippet}
        </pre>
      )}

      <footer className="mt-4 flex flex-wrap gap-2">
        <ActionButton icon="check" tone="blue" disabled={busy} onClick={() => onAction(email, "read")}>
          Mark as read
        </ActionButton>
        <ActionButton icon="thumbsUp" tone="green" disabled={busy} onClick={() => onAction(email, "keep")}>
          Not spam
        </ActionButton>
        <ActionButton icon="flag" tone="amber" disabled={busy} onClick={() => onAction(email, "report")}>
          Report spam
        </ActionButton>
        <ActionButton icon="trash" tone="red" disabled={busy} onClick={() => onAction(email, "delete")}>
          Delete
        </ActionButton>
        <ActionButton icon="eye" onClick={() => setShowBody((value) => !value)}>
          {showBody ? "Hide email" : "Read email"}
        </ActionButton>
        <a
          href={email.gmailUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
        >
          <Icon name="external" />
          Open in Gmail
        </a>
      </footer>
    </article>
  );
}
