import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { LABEL_STYLES } from "../labels";
import { muted } from "../ui";
import Icon from "./Icon";

export default function SpamChart({ stats }) {
  const data = [
    { name: "Spam", value: stats.spam, color: LABEL_STYLES["Likely spam"].color },
    { name: "Suspicious", value: stats.suspicious, color: LABEL_STYLES.Suspicious.color },
    { name: "Safe", value: stats.safe, color: LABEL_STYLES["Likely safe"].color },
  ];
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-28 w-28 shrink-0">
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={38} outerRadius={54} paddingAngle={2} stroke="none">
                {data.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full rounded-full border-[16px] border-slate-100 dark:border-slate-800" />
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-slate-900 dark:text-white">{total}</span>
          <span className={`text-[11px] ${muted}`}>unread</span>
        </div>
      </div>

      <ul className="flex-1 space-y-1.5 text-sm">
        {data.map((item) => (
          <li key={item.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-medium tabular-nums text-slate-900 dark:text-white">{item.value}</span>
          </li>
        ))}
        {stats.phishing > 0 && (
          <li className="flex items-center gap-1.5 whitespace-nowrap pt-1 text-xs text-indigo-600 dark:text-indigo-400">
            <Icon name="alert" className="h-3.5 w-3.5" /> {stats.phishing} phishing alert{stats.phishing === 1 ? "" : "s"}
          </li>
        )}
      </ul>
    </div>
  );
}
