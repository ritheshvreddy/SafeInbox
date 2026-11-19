import { useEffect, useState } from "react";
import { api } from "../api";
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
        <legend className="mb-2 font-medium">Spam sensitivity</legend>
        <div className="space-y-2">
          {SENSITIVITY.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                draft.sensitivity === option.value
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <input
                type="radio"
                name="sensitivity"
                value={option.value}
                checked={draft.sensitivity === option.value}
                onChange={() => setDraft({ ...draft, sensitivity: option.value })}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{option.title}</span>
                <span className="block text-sm text-slate-500 dark:text-slate-400">{option.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-medium">Summary length</span>
          <select
            value={draft.summary_sentences}
            onChange={(event) => setDraft({ ...draft, summary_sentences: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} sentence{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-medium">Emails per refresh</span>
          <select
            value={draft.max_emails}
            onChange={(event) => setDraft({ ...draft, max_emails: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
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
        <h3 className="font-medium">Senders you've marked</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          "Not spam" trusts a sender; "Report spam" blocks them. Remove one to go back to normal scoring.
        </p>
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {senders === null && <li className="p-3 text-sm text-slate-400">Loading…</li>}
          {senders?.length === 0 && <li className="p-3 text-sm text-slate-400">No senders yet.</li>}
          {senders?.map((sender) => (
            <li key={sender.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0 truncate">{sender.email}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    sender.status === "trusted"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                  }`}
                >
                  {sender.status === "trusted" ? "Trusted" : "Blocked"}
                </span>
                <button onClick={() => forget(sender)} className="text-blue-700 hover:underline dark:text-blue-300">
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
