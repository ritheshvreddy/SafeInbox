import { ACTION_TEXT, LABEL_STYLES, formatDate, initialOf } from "../labels";
import { btn, cx, label, muted } from "../ui";
import Icon from "./Icon";
import Logo from "./Logo";

function NavItem({ icon, children, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      )}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" />
      <span className="flex-1 text-left">{children}</span>
      {count !== undefined && (
        <span
          className={cx(
            "rounded-full px-2 py-0.5 text-xs tabular-nums",
            active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({ user, unread, history, onLogout, onOpenAdmin, onOpenSettings, onOpenInfo, onSelectHistory }) {
  return (
    <aside className="flex flex-col border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center justify-between px-5 py-4 md:py-5">
        <Logo size={30} nameClassName="text-lg" />
        <button onClick={onLogout} className={cx(btn.icon, "md:hidden")} aria-label="Log out" title="Log out">
          <Icon name="logout" className="h-5 w-5" />
        </button>
      </div>

      <nav className="hidden space-y-1 px-3 md:block">
        <NavItem icon="mail" active count={unread}>
          Inbox
        </NavItem>
        <NavItem icon="gear" onClick={onOpenSettings}>
          Settings
        </NavItem>
        <NavItem icon="info" onClick={onOpenInfo}>
          About &amp; privacy
        </NavItem>
        {user.role === "admin" && (
          <NavItem icon="chart" onClick={onOpenAdmin}>
            Admin
          </NavItem>
        )}
      </nav>

      <section className="hidden min-h-0 flex-1 overflow-y-auto px-5 pt-8 md:block">
        <h2 className={cx(label, "mb-2")}>Recent activity</h2>
        {history.length === 0 ? (
          <p className={cx("text-sm", muted)}>Emails you've checked will appear here.</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onSelectHistory(item)}
                  className="w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  title={formatDate(item.analyzedAt)}
                >
                  <span className="flex items-center gap-2">
                    <span className={cx("h-2 w-2 shrink-0 rounded-full", LABEL_STYLES[item.label]?.dot)} />
                    <span className="truncate text-sm text-slate-700 dark:text-slate-200">{item.subject}</span>
                  </span>
                  <span className={cx("block truncate pl-4 text-xs", muted)}>
                    {item.userAction ? ACTION_TEXT[item.userAction] : item.label} · {item.senderName || item.from}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="hidden items-center gap-3 border-t border-slate-200 px-4 py-4 dark:border-slate-800 md:flex">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold text-white">
          {initialOf(user.name || user.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{user.name}</p>
          <p className={cx("truncate text-xs", muted)}>{user.email}</p>
        </div>
        <button onClick={onLogout} className={btn.icon} aria-label="Log out" title="Log out">
          <Icon name="logout" className="h-[18px] w-[18px]" />
        </button>
      </div>
    </aside>
  );
}
