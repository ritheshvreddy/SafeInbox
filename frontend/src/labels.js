// Shared display helpers for spam labels, dates and percentages.
export const LABELS = ["Likely spam", "Suspicious", "Likely safe"];

export const LABEL_STYLES = {
  "Likely spam": {
    badge: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25",
    dot: "bg-rose-500",
    meter: "bg-rose-500",
    bar: "bg-rose-500",
    short: "Spam",
  },
  Suspicious: {
    badge: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25",
    dot: "bg-amber-500",
    meter: "bg-amber-500",
    bar: "bg-amber-400",
    short: "Suspicious",
  },
  "Likely safe": {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25",
    dot: "bg-emerald-500",
    meter: "bg-emerald-500",
    bar: "bg-emerald-500",
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

// "just now", "5m ago", "3h ago", "Yesterday", or a short date.
export function timeAgo(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (Number.isNaN(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function initialOf(text) {
  return ((text || "?").replace(/^["'\s]+/, "").charAt(0) || "?").toUpperCase();
}
