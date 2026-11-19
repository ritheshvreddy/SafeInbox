// Shared Tailwind class names: indigo is the brand colour; rose / amber / emerald mean spam / suspicious / safe.
export const cx = (...classes) => classes.filter(Boolean).join(" ");

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";
const base = `inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

export const btn = {
  primary: `${base} bg-indigo-600 px-3.5 py-2 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-500`,
  secondary: `${base} border border-slate-200 bg-white px-3.5 py-2 text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`,
  ghost: `${base} px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white`,
  icon: `${base} h-9 w-9 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white`,
  success: `${base} bg-emerald-50 px-3.5 py-2 text-emerald-700 ring-1 ring-inset ring-emerald-600/15 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20 dark:hover:bg-emerald-500/20`,
  warning: `${base} bg-amber-50 px-3.5 py-2 text-amber-800 ring-1 ring-inset ring-amber-600/15 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20 dark:hover:bg-amber-500/20`,
  danger: `${base} px-3 py-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10`,
};

export const card = "rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";
export const muted = "text-slate-500 dark:text-slate-400";
export const label = "text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500";
export const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900";
export const link = "font-medium text-indigo-600 hover:text-indigo-500 hover:underline dark:text-indigo-400";

// Message boxes by meaning.
export const tone = {
  info: "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-100",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100",
  danger: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-100",
};
export const toneIcon = {
  info: "text-indigo-600 dark:text-indigo-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
};
export const box = (kind) => cx("rounded-xl border px-4 py-3 text-sm", tone[kind]);

// Sender avatar colours (picked from the sender's address so each sender keeps the same colour).
const AVATARS = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
];
export function avatarClass(seed = "") {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[hash % AVATARS.length];
}
