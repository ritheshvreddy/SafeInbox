import { cx } from "../ui";
import Icon from "./Icon";

const CARDS = [
  {
    key: "all",
    label: "Unread emails",
    icon: "mail",
    value: (s) => s.spam + s.suspicious + s.safe,
    tint: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
  },
  {
    key: "Likely spam",
    label: "Likely spam",
    icon: "flag",
    value: (s) => s.spam,
    tint: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  },
  {
    key: "Suspicious",
    label: "Suspicious",
    icon: "eye",
    value: (s) => s.suspicious,
    tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
  {
    key: "Likely safe",
    label: "Likely safe",
    icon: "shield",
    value: (s) => s.safe,
    tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
];

// Summary row at the top of the inbox. Clicking a card filters the list.
export default function StatCards({ stats, filter, onFilter }) {
  const total = stats.spam + stats.suspicious + stats.safe;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((item) => {
        const value = item.value(stats);
        const active = filter === item.key;
        const share = item.key === "all" || total === 0 ? null : Math.round((value / total) * 100);
        return (
          <button
            key={item.key}
            onClick={() => onFilter(item.key)}
            className={cx(
              "group rounded-2xl border bg-white p-4 text-left shadow-sm transition dark:bg-slate-900",
              active
                ? "border-indigo-500 ring-4 ring-indigo-500/10 dark:border-indigo-400"
                : "border-slate-200/80 hover:border-slate-300 hover:shadow dark:border-slate-800 dark:hover:border-slate-700"
            )}
          >
            <div className="flex items-start justify-between">
              <span className={cx("flex h-9 w-9 items-center justify-center rounded-xl", item.tint)}>
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
              </span>
              {share !== null && (
                <span className="text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">{share}%</span>
              )}
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{item.label}</p>
          </button>
        );
      })}
    </div>
  );
}
