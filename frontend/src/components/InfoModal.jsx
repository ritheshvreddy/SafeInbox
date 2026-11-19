import { useState } from "react";
import { api } from "../api";
import Icon from "./Icon";
import Modal from "./Modal";

export default function InfoModal({ signedIn, retentionDays = 30, onClose, onAccountDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function exportData() {
    setBusy(true);
    setError("");
    try {
      const response = await api("/api/me/export", { raw: true });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "safeinbox-my-data.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!window.confirm("Delete your SafeInbox account and all stored data? Your Gmail messages are not affected.")) {
      return;
    }
    setBusy(true);
    try {
      await api("/api/me", { method: "DELETE" });
      onAccountDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="About SafeInbox" onClose={onClose} wide>
      <div className="space-y-5 text-sm leading-6 text-slate-700 dark:text-slate-300">
        <section>
          <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">What it does</h3>
          <p>
            SafeInbox scans your unread Gmail emails and helps you decide which to read and which to ignore. Each email
            gets a spam score, a type (likely safe, suspicious or likely spam), a short summary, an explanation, and
            phishing warnings for dangerous-looking links.
          </p>
        </section>

        <section>
          <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">How it works</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Unread inbox emails are fetched through the Gmail API with your permission (OAuth 2.0).</li>
            <li>Each email is cleaned: HTML tags, quoted replies and signatures are removed.</li>
            <li>A Naive Bayes classifier with TF-IDF features estimates how likely it is to be spam.</li>
            <li>
              The score is adjusted using the sender: senders you trusted or reported, and Gmail's SPF/DKIM/DMARC
              checks. Links are checked for phishing tricks.
            </li>
            <li>TextRank picks the most important sentences as a summary.</li>
            <li>Your "Report spam" and "Not spam" choices are used when an administrator retrains the model.</li>
          </ol>
        </section>

        <section>
          <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">Your privacy</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Email content, your name, email address and Gmail access token are stored encrypted (AES-256).</li>
            <li>Analysed emails are deleted automatically after {retentionDays} days.</li>
            <li>SafeInbox never sends your emails anywhere else. Logging out revokes its Gmail access.</li>
            <li>You can download everything stored about you, or delete it, at any time (GDPR).</li>
          </ul>
          <p className="mt-2">
            Read the full{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-blue-700 underline dark:text-blue-300">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/terms" target="_blank" rel="noreferrer" className="text-blue-700 underline dark:text-blue-300">
              Terms of Service
            </a>
            .
          </p>
        </section>

        {signedIn && (
          <section className="flex flex-wrap gap-2">
            <button
              onClick={exportData}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              <Icon name="download" /> Download my data
            </button>
            <button
              onClick={deleteAccount}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-red-600 px-3 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              <Icon name="trash" /> Delete my account and data
            </button>
          </section>
        )}
        {error && <p className="text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
