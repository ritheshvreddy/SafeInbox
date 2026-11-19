import { useState } from "react";
import { api } from "../api";
import { btn, link } from "../ui";
import Icon from "./Icon";
import Modal from "./Modal";

function Section({ title, children }) {
  return (
    <section>
      <h3 className="mb-1.5 font-semibold text-slate-900 dark:text-white">{title}</h3>
      {children}
    </section>
  );
}

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
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "safeinbox-my-data.json";
      anchor.click();
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
      <div className="space-y-6 text-sm leading-6 text-slate-600 dark:text-slate-300">
        <Section title="What it does">
          <p>
            SafeInbox scans your unread Gmail emails and helps you decide which to read and which to ignore. Each email
            gets a spam score, a type (likely safe, suspicious or likely spam), a short summary, an explanation and
            phishing warnings for dangerous-looking links.
          </p>
        </Section>

        <Section title="How it works">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Unread inbox emails are fetched through the Gmail API with your permission (OAuth 2.0).</li>
            <li>Each email is cleaned: HTML tags, quoted replies and signatures are removed.</li>
            <li>A Naive Bayes classifier with TF-IDF features estimates how likely it is to be spam.</li>
            <li>
              The score is adjusted using the sender: senders you trusted or reported, and Gmail's SPF/DKIM/DMARC checks.
              Links are checked for phishing tricks.
            </li>
            <li>TextRank picks the most important sentences as a summary.</li>
            <li>"Report spam" and "Not spam" change how emails from that sender are scored for you.</li>
          </ol>
        </Section>

        <Section title="Your privacy">
          <ul className="list-disc space-y-1 pl-5">
            <li>Email content, your name, email address and Gmail access token are stored encrypted (AES-256).</li>
            <li>Analysed emails are deleted automatically after {retentionDays} days.</li>
            <li>SafeInbox never sends your emails anywhere else. Logging out revokes its Gmail access.</li>
            <li>You can download everything stored about you, or delete it, at any time (GDPR).</li>
          </ul>
          <p className="mt-2">
            Read the full{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className={link}>
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/terms" target="_blank" rel="noreferrer" className={link}>
              Terms of Service
            </a>
            .
          </p>
        </Section>

        {signedIn && (
          <section className="flex flex-wrap gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
            <button onClick={exportData} disabled={busy} className={btn.secondary}>
              <Icon name="download" /> Download my data
            </button>
            <button onClick={deleteAccount} disabled={busy} className={btn.danger}>
              <Icon name="trash" /> Delete my account and data
            </button>
          </section>
        )}
        {error && <p className="font-medium text-slate-900 dark:text-white">{error}</p>}
      </div>
    </Modal>
  );
}
