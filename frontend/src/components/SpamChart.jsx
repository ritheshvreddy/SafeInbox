import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { LABEL_STYLES } from "../labels";

export default function SpamChart({ stats }) {
  const data = [
    { name: "Spam", value: stats.spam, color: LABEL_STYLES["Likely spam"].color },
    { name: "Suspicious", value: stats.suspicious, color: LABEL_STYLES.Suspicious.color },
    { name: "Safe", value: stats.safe, color: LABEL_STYLES["Likely safe"].color },
  ];
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div>
      <div className="relative h-40">
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={45} outerRadius={65} paddingAngle={3} stroke="none">
                {data.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">No emails analysed yet</div>
        )}
        {total > 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{total}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">unread</span>
          </div>
        )}
      </div>
      <ul className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
        {data.map((item) => (
          <li key={item.name}>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
            <div className="text-sm font-semibold">{item.value}</div>
          </li>
        ))}
      </ul>
      {stats.phishing > 0 && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-center text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {stats.phishing} with phishing warning signs
        </p>
      )}
    </div>
  );
}
