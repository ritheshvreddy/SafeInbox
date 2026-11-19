import { ACTION_TEXT, LABEL_STYLES, formatDate } from "../labels";
import Icon from "./Icon";
import Logo from "./Logo";
import SpamChart from "./SpamChart";

export default function Sidebar({ user, stats, history, onLogout, onOpenAdmin, onSelectHistory }) {
  return (
    <aside className="flex flex-col gap-6 border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 md:sticky md:top-0 md:h-screen md:w-72 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0">
      <Logo size={40} />

      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-900/20">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          ● Signed in{user.role === "admin" && " · Admin"}
        </p>
        <p className="mt-1 truncate font-semibold">{user.name}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onLogout}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            <Icon name="logout" /> Logout
          </button>
          {user.role === "admin" && (
            <button
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <Icon name="chart" /> Admin
            </button>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Spam stats
        </h2>
        <SpamChart stats={stats} />
      </section>

      <section className="min-h-0">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Previous mails
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">Emails you've checked will appear here.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 md:max-h-none">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onSelectHistory(item)}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={formatDate(item.analyzedAt)}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: LABEL_STYLES[item.label]?.color }}
                    />
                    <span className="truncate text-sm">{item.subject}</span>
                  </span>
                  <span className="block truncate pl-4 text-xs text-slate-500 dark:text-slate-400">
                    {item.userAction ? ACTION_TEXT[item.userAction] : item.label === "Likely safe" ? "Spam rejected" : `${item.label} detected`}
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
