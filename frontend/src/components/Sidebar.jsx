import { ACTION_TEXT, LABEL_STYLES, formatDate } from "../labels";
import { btn, cx, label, muted } from "../ui";
import Icon from "./Icon";
import Logo from "./Logo";
import SpamChart from "./SpamChart";

export default function Sidebar({ user, stats, history, onLogout, onOpenAdmin, onSelectHistory }) {
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <aside className="flex flex-col gap-5 border-b border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0 md:h-screen md:w-72 md:shrink-0 md:gap-8 md:overflow-y-auto md:border-r md:border-b-0 md:py-6">
      <Logo size={32} nameClassName="text-lg" />

      <section>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-medium text-slate-900 dark:text-white">
              <span className="truncate">{user.name}</span>
              {user.role === "admin" && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Admin
                </span>
              )}
            </p>
            <p className={cx("truncate text-xs", muted)}>{user.email}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-1">
          <button onClick={onLogout} className={cx(btn.ghost, "-ml-3")}>
            <Icon name="logout" /> Log out
          </button>
          {user.role === "admin" && (
            <button onClick={onOpenAdmin} className={btn.ghost}>
              <Icon name="chart" /> Admin
            </button>
          )}
        </div>
      </section>

      {/* On phones the filter tabs already show the counts, so the chart and history only appear on larger screens. */}
      <section className="hidden md:block">
        <h2 className={cx(label, "mb-3")}>Overview</h2>
        <SpamChart stats={stats} />
      </section>

      <section className="hidden min-h-0 md:block">
        <h2 className={cx(label, "mb-2")}>Previous mails</h2>
        {history.length === 0 ? (
          <p className={cx("text-sm", muted)}>Emails you've checked will appear here.</p>
        ) : (
          <ul className="-mx-2 max-h-72 space-y-0.5 overflow-y-auto md:max-h-none">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onSelectHistory(item)}
                  className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  title={formatDate(item.analyzedAt)}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: LABEL_STYLES[item.label]?.color }}
                    />
                    <span className="truncate text-sm text-slate-700 dark:text-slate-200">{item.subject}</span>
                  </span>
                  <span className={cx("block truncate pl-3.5 text-xs", muted)}>
                    {item.userAction ? ACTION_TEXT[item.userAction] : item.label}
                    {" · "}
                    {item.senderName || item.from}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
