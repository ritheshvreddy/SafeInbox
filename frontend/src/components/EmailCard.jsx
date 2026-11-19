import { useState } from "react";
import { LABEL_STYLES, formatDate, percent } from "../labels";
import { btn, card, cx, label, muted, notice } from "../ui";
import Icon from "./Icon";

function PhishingWarning({ phishing }) {
  if (!["medium", "high"].includes(phishing.risk)) return null;
  return (
    <div className={cx(notice, "mt-4")}>
      <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
        <Icon name="alert" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        {phishing.risk === "high"
          ? "Possible phishing - don't click links or share passwords"
          : "Be careful with the links in this email"}
      </p>
      <ul className="mt-1.5 space-y-1 pl-6 text-slate-600 dark:text-slate-300">
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

function ScoringDetails({ email }) {
  const hasDetails = email.signals.length > 0 || email.spamWords.length > 0 || email.hamWords.length > 0;
  if (!hasDetails) return null;
  return (
    <details className="group mt-2 text-sm">
      <summary className={cx("cursor-pointer list-none select-none", muted, "hover:text-slate-700 dark:hover:text-slate-200")}>
        <span className="inline-flex items-center gap-1">
          <span className="transition group-open:rotate-90">›</span> Scoring details
        </span>
      </summary>
      <div className="mt-2 space-y-2 pl-3">
        {email.signals.length > 0 && (
          <ul className="space-y-0.5 text-slate-600 dark:text-slate-300">
            {email.signals.map((signal) => (
              <li key={signal.text} className="flex gap-2">
                <span className="text-slate-400">{signal.direction === "up" ? "↑" : "↓"}</span>
                {signal.text}
              </li>
            ))}
          </ul>
        )}
        {(email.spamWords.length > 0 || email.hamWords.length > 0) && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {email.spamWords.map((word) => (
              <span
                key={`s-${word}`}
                title="Appeared mostly in spam during training"
                className="rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200"
              >
                ↑ {word}
              </span>
            ))}
            {email.hamWords.map((word) => (
              <span
                key={`h-${word}`}
                title="Appeared mostly in normal emails during training"
                className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                ↓ {word}
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export default function EmailCard({ email, busy, onAction }) {
  const [showBody, setShowBody] = useState(false);
  const style = LABEL_STYLES[email.label];

  return (
    <article
      id={`email-${email.id}`}
      className={cx(card, "relative scroll-mt-24 overflow-hidden p-5 transition hover:border-slate-300 dark:hover:border-slate-700")}
    >
      <span className={cx("absolute inset-y-0 left-0 w-1", style.bar)} aria-hidden="true" />

      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
            {email.senderName || email.senderEmail}
            {email.senderStatus && (
              <span className={cx("ml-2 text-xs font-normal", muted)}>
                · {email.senderStatus === "trusted" ? "trusted sender" : "reported sender"}
              </span>
            )}
          </p>
          <p className={cx("truncate text-xs", muted)}>
            {email.senderEmail} · {formatDate(email.receivedAt)}
          </p>
        </div>
        <span className={cx("shrink-0 rounded-md px-2 py-1 text-xs font-medium tabular-nums", style.badge)}>
          {email.label} · {percent(email.spamScore)}
        </span>
      </header>

      <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">{email.subject}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {email.summary || email.snippet || "(no text)"}
      </p>

      <PhishingWarning phishing={email.phishing} />

      <div className="mt-4">
        <p className={label}>Why</p>
        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{email.reason}</p>
        <ScoringDetails email={email} />
      </div>

      {showBody && (
        <pre className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {email.body || email.snippet}
        </pre>
      )}

      <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <button className={btn.primary} disabled={busy} onClick={() => onAction(email, "read")}>
          <Icon name="check" /> Mark as read
        </button>
        <button className={btn.secondary} disabled={busy} onClick={() => onAction(email, "keep")}>
          Not spam
        </button>
        <button className={btn.secondary} disabled={busy} onClick={() => onAction(email, "report")}>
          Report spam
        </button>
        <button className={btn.ghost} disabled={busy} onClick={() => onAction(email, "delete")}>
          <Icon name="trash" /> Delete
        </button>
        <span className="flex-1" />
        <button className={btn.ghost} onClick={() => setShowBody((value) => !value)}>
          {showBody ? "Hide email" : "Read email"}
        </button>
        <a href={email.gmailUrl} target="_blank" rel="noreferrer" className={btn.ghost}>
          Open in Gmail <Icon name="external" className="h-3.5 w-3.5" />
        </a>
      </footer>
    </article>
  );
}
