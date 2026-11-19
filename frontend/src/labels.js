// Shared display helpers for spam labels, dates and percentages.
// Labels are told apart by shades of the single accent colour (indigo), not by different colours.
export const LABELS = ["Likely spam", "Suspicious", "Likely safe"];

export const LABEL_STYLES = {
  "Likely spam": {
    badge: "bg-indigo-600 text-white dark:bg-indigo-500",
    bar: "bg-indigo-600 dark:bg-indigo-500",
    color: "#4f46e5",
    short: "Spam",
  },
  Suspicious: {
    badge: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:ring-indigo-400/30",
    bar: "bg-indigo-300 dark:bg-indigo-400/60",
    color: "#a5b4fc",
    short: "Suspicious",
  },
  "Likely safe": {
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    bar: "bg-transparent",
    color: "#94a3b8",
    short: "Safe",
  },
};

export const ACTION_TEXT = {
  read: "Marked as read",
  deleted: "Deleted",
  reported: "Reported as spam",
  kept: "Marked not spam",
};

export function percent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

export function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
