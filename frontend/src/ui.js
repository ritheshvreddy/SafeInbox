// Shared Tailwind class names. The whole UI uses ONE accent colour (indigo) plus neutral greys.
export const cx = (...classes) => classes.filter(Boolean).join(" ");

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

export const btn = {
  primary: `inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  secondary: `inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 ${focus}`,
  ghost: `inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white ${focus}`,
  icon: `inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white ${focus}`,
};

export const card = "rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
export const muted = "text-slate-500 dark:text-slate-400";
export const heading = "text-slate-900 dark:text-white";
export const label = "text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500";
export const notice =
  "rounded-lg border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-sm text-slate-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-slate-200";
export const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900";
export const link = "font-medium text-indigo-600 hover:underline dark:text-indigo-400";
