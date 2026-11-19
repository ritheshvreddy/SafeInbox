import { useState } from "react";
import { LABEL_STYLES, formatDate, initialOf, percent, timeAgo } from "../labels";
import { avatarClass, box, btn, card, cx, label, muted, toneIcon } from "../ui";
import Icon from "./Icon";

function RiskMeter({ score, style }) {
  return (
    <div className="flex items-center gap-2" title={`Spam score ${percent(score)}`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={cx("h-full rounded-full", style.meter)} style={{ width: `${Math.max(4, score * 100)}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
        {percent(score)}
      </span>
    </div>
  );
}

function PhishingWarning({ phishing }) {
  if (!["medium", "high"].includes(phishing.risk)) return null;
  const kind = phishing.risk === "high" ? "danger" : "warning";
  return (
    <div className={cx(box(kind), "mt-4")}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="alert" className={cx("h-4 w-4", toneIcon[kind])} />
        {phishing.risk === "high"
          ? "Possible phishing - don't click links or share passwords"
          : "Be careful with the links in this email"}
      </p>
      <ul className="mt-1.5 space-y-1 pl-6 opacity-90">
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
  if (!email.signals.length && !email.spamWords.length && !email.hamWords.length) return null;
  return (
    <details className="group mt-2 text-sm">
      <summary className="inline-flex cursor-pointer list-none select-none items-center gap-1 text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
        <span className="transition group-open:rotate-90">›</span>
        <span className="group-open:hidden">Show scoring details</span>
        <span className="hidden group-open:inline">Hide scoring details</span>
      </summary>
      <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        {email.signals.length > 0 && (
          <ul className="space-y-1 text-slate-600 dark:text-slate-300">
            {email.signals.map((signal) => (
              <li key={signal.text} className="flex gap-2">
                <span className={signal.direction === "up" ? "text-rose-500" : "text-emerald-500"}>
                  {signal.direction === "up" ? "▲" : "▼"}
                </span>
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
                className="rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700 ring-1 ring-inset ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300"
              >
                {word}
              </span>
            ))}
            {email.hamWords.map((word) => (
              <span
                key={`h-${word}`}
                title="Appeared mostly in normal emails during training"
                className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300"
              >
                {word}
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
  const name = email.senderName || email.senderEmail;

  return (
    <article
      id={`email-${email.id}`}
      className={cx(card, "relative scroll-mt-24 overflow-hidden p-5 transition hover:shadow-md sm:p-6")}
    >
      <span className={cx("absolute inset-y-0 left-0 w-1", style.bar)} aria-hidden="true" />

      <header className="flex items-start gap-3">
        <span
          className={cx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            avatarClass(email.senderEmail)
          )}
        >
          {initialOf(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-semibold text-slate-900 dark:text-white">{name}</p>
            {email.senderStatus === "trusted" && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                Trusted
              </span>
            )}
            {email.senderStatus === "blocked" && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                Reported
              </span>
            )}
          </div>
          <p className={cx("truncate text-xs", muted)}>
            {email.senderEmail} · <span title={formatDate(email.receivedAt)}>{timeAgo(email.receivedAt)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
              style.badge
            )}
          >
            <span className={cx("h-1.5 w-1.5 rounded-full", style.dot)} />
            {email.label}
          </span>
          <RiskMeter score={email.spamScore} style={style} />
        </div>
      </header>

      <div className="mt-4 sm:pl-[52px]">
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">{email.subject}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {email.summary || email.snippet || "(no text)"}
        </p>

        <PhishingWarning phishing={email.phishing} />

        <div className="mt-4 rounded-xl border border-slate-100 p-3.5 dark:border-slate-800">
          <p className={label}>Why this rating</p>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{email.reason}</p>
          <ScoringDetails email={email} />
        </div>

        {showBody && (
          <pre className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-100 bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            {email.body || email.snippet}
          </pre>
        )}

        <footer className="mt-5 flex flex-wrap items-center gap-2">
          <button className={btn.primary} disabled={busy} onClick={() => onAction(email, "read")}>
            <Icon name="check" /> Mark as read
          </button>
          <button className={btn.success} disabled={busy} onClick={() => onAction(email, "keep")}>
            <Icon name="thumbsUp" /> Not spam
          </button>
          <button className={btn.warning} disabled={busy} onClick={() => onAction(email, "report")}>
            <Icon name="flag" /> Report spam
          </button>
          <button className={btn.danger} disabled={busy} onClick={() => onAction(email, "delete")}>
            <Icon name="trash" /> Delete
          </button>
          <span className="flex-1" />
          <button className={btn.ghost} onClick={() => setShowBody((value) => !value)}>
            <Icon name="eye" /> {showBody ? "Hide" : "Read"}
          </button>
          <a href={email.gmailUrl} target="_blank" rel="noreferrer" className={btn.ghost}>
            Gmail <Icon name="external" className="h-3.5 w-3.5" />
          </a>
        </footer>
      </div>
    </article>
  );
}
