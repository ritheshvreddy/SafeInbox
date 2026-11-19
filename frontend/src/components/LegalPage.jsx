// Public Privacy Policy and Terms of Service pages (required by Google to publish the OAuth app).
import Logo from "./Logo";

const UPDATED = "19 November 2026";
const REPO = "https://github.com/ritheshvreddy/SafeInbox";
const CONTACT = import.meta.env.VITE_SUPPORT_EMAIL;

function Contact() {
  return CONTACT ? (
    <a className="text-blue-700 underline dark:text-blue-300" href={`mailto:${CONTACT}`}>
      {CONTACT}
    </a>
  ) : (
    <a className="text-blue-700 underline dark:text-blue-300" href={`${REPO}/issues`}>
      the project's GitHub page
    </a>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function Privacy() {
  return (
    <>
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Last updated {UPDATED}</p>
      <p className="mt-4">
        SafeInbox ("we") is a web app that helps you decide which unread Gmail emails to read by showing a spam score,
        a summary and phishing warnings for each one. This policy explains what data SafeInbox uses and how.
      </p>

      <Section title="Data we access">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your Google account name and email address, to sign you in.</li>
          <li>
            Your unread Gmail inbox emails (sender, subject, date, text and links), through the Gmail API scope{" "}
            <code>gmail.modify</code>.
          </li>
          <li>Your settings (spam sensitivity, summary length) and the senders you mark as trusted or as spam.</li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>Only to show you spam scores, summaries, explanations and phishing warnings for your own emails.</li>
          <li>
            We change your mailbox only when you click a button: "Mark as read" removes the unread label, "Delete"
            moves the email to Trash, and "Report spam" moves it to the Spam folder.
          </li>
          <li>
            Your choices ("Report spam", "Not spam") only change how emails from that sender are scored for you.
          </li>
        </ul>
      </Section>

      <Section title="Storage and security">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Analysed email content, your name, email address and Gmail access token are encrypted with AES-256 before
            they are stored in our database (MongoDB Atlas).
          </li>
          <li>Analysed emails are deleted automatically after 30 days.</li>
          <li>All connections use HTTPS. Logging out revokes SafeInbox's access to Gmail.</li>
        </ul>
      </Section>

      <Section title="Sharing">
        <p>
          We do not sell your data, show ads, or share your data with anyone. No person reads your emails; they are only
          processed automatically to produce the results you see. Your Gmail data is not used to train machine-learning
          models.
        </p>
        <p>
          SafeInbox's use and transfer of information received from Google APIs adheres to the{" "}
          <a
            className="text-blue-700 underline dark:text-blue-300"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc space-y-1 pl-5">
          <li>Download everything we store about you: ⓘ menu → "Download my data".</li>
          <li>Delete your account and all stored data: ⓘ menu → "Delete my account and data".</li>
          <li>
            Remove access at any time in your{" "}
            <a className="text-blue-700 underline dark:text-blue-300" href="https://myaccount.google.com/permissions">
              Google account permissions
            </a>
            .
          </li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy: <Contact />.
        </p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1 className="text-2xl font-bold">Terms of Service</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Last updated {UPDATED}</p>
      <Section title="The service">
        <p>
          SafeInbox is a free student project that analyses your unread Gmail emails and suggests which may be spam or
          phishing. It is provided "as is", without warranties of any kind.
        </p>
      </Section>
      <Section title="Your responsibility">
        <p>
          Spam scores and phishing warnings are automated estimates and can be wrong. Check important emails yourself
          before deleting them or acting on them. Deleted emails stay in Gmail's Trash for 30 days.
        </p>
      </Section>
      <Section title="Acceptable use">
        <p>Only connect a Gmail account you own or are allowed to manage. Don't try to disrupt or misuse the service.</p>
      </Section>
      <Section title="Changes and availability">
        <p>
          The service may change, be unavailable, or stop at any time. You can delete your data whenever you like (see
          the Privacy Policy).
        </p>
      </Section>
      <Section title="Contact">
        <p>
          <Contact />
        </p>
      </Section>
    </>
  );
}

export default function LegalPage({ kind }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200">
      <main className="mx-auto max-w-3xl px-4 py-8 leading-7 sm:px-6">
        <a href="/" className="mb-6 inline-block text-slate-900 dark:text-white">
          <Logo size={36} nameClassName="text-xl" />
        </a>
        {kind === "terms" ? <Terms /> : <Privacy />}
        <p className="mt-10 text-sm text-slate-500 dark:text-slate-400">
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>{" "}
          ·{" "}
          <a href="/terms" className="underline">
            Terms of Service
          </a>{" "}
          ·{" "}
          <a href={REPO} className="underline">
            Source code
          </a>
        </p>
      </main>
    </div>
  );
}
