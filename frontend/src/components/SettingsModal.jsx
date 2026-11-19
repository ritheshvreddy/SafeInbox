import { useEffect, useState } from "react";
import { api } from "../api";
import { btn, cx, input, link, muted } from "../ui";
import Modal from "./Modal";

const SENSITIVITY = [
  { value: "low", title: "Low", text: "Only flag emails the model is very sure about. Fewer false alarms." },
  { value: "medium", title: "Medium", text: "Balanced (recommended)." },
  { value: "high", title: "High", text: "Flag anything slightly spammy. Catches more spam, more false alarms." },
];

export default function SettingsModal({ preferences, onSave, onClose }) {
  const [draft, setDraft] = useState(preferences);
  const [senders, setSenders] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/senders")
      .then((data) => setSenders(data.senders))
      .catch(() => setSenders([]));
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave({
        sensitivity: draft.sensitivity,
        summary_sentences: Number(draft.summary_sentences),
        max_emails: Number(draft.max_emails),
      });
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function forget(sender) {
    await api(`/api/senders/${sender.id}`, { method: "DELETE" });
    setSenders((current) => current.filter((item) => item.id !== sender.id));
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900 dark:text-white">Spam sensitivity</legend>
        <div className="space-y-2">
          {SENSITIVITY.map((option) => {
            const selected = draft.sensitivity === option.value;
            return (
              <label
                key={option.value}
                className={cx(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 transition",
                  selected
                    ? "border-indigo-500 bg-indigo-50/60 dark:border-indigo-400 dark:bg-indigo-500/10"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                )}
              >
                <input
                  type="radio"
                  name="sensitivity"
                  value={option.value}
                  checked={selected}
                  onChange={() => setDraft({ ...draft, sensitivity: option.value })}
                  className="mt-1 accent-indigo-600"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-900 dark:text-white">{option.title}</span>
                  <span className={cx("block", muted)}>{option.text}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-900 dark:text-white">Summary length</span>
          <select
            value={draft.summary_sentences}
            onChange={(event) => setDraft({ ...draft, summary_sentences: event.target.value })}
            className={cx(input, "mt-1.5")}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} sentence{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-900 dark:text-white">Emails per refresh</span>
          <select
            value={draft.max_emails}
            onChange={(event) => setDraft({ ...draft, max_emails: event.target.value })}
            className={cx(input, "mt-1.5")}
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} unread emails
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-900 dark:text-white">Senders you've marked</h3>
        <p className={cx("text-sm", muted)}>
          "Not spam" trusts a sender, "Report spam" blocks them. Remove one to go back to normal scoring.
        </p>
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {senders === null && <li className={cx("p-3 text-sm", muted)}>Loading…</li>}
          {senders?.length === 0 && <li className={cx("p-3 text-sm", muted)}>No senders yet.</li>}
          {senders?.map((sender) => (
            <li key={sender.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{sender.email}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span
                  className={cx(
                    "rounded-md px-2 py-0.5 text-xs",
                    sender.status === "trusted"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                  )}
                >
                  {sender.status === "trusted" ? "Trusted" : "Blocked"}
                </span>
                <button onClick={() => forget(sender)} className={link}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="mt-4 text-sm font-medium text-slate-900 dark:text-white">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className={btn.ghost}>
          Cancel
        </button>
        <button onClick={save} disabled={saving} className={btn.primary}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
