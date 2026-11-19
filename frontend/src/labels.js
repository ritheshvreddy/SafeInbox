// Shared display helpers for spam labels, dates and percentages.
export const LABELS = ["Likely spam", "Suspicious", "Likely safe"];

export const LABEL_STYLES = {
  "Likely spam": {
    badge: "bg-red-100 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/30",
    accent: "border-l-red-500",
    color: "#ef4444",
    short: "Spam",
  },
  Suspicious: {
    badge: "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
    accent: "border-l-amber-500",
    color: "#f59e0b",
    short: "Suspicious",
  },
  "Likely safe": {
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
    accent: "border-l-emerald-500",
    color: "#10b981",
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
