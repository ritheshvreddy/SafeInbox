import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { formatDate, percent } from "../labels";
import { box, btn, cx, muted } from "../ui";
import Icon from "./Icon";
import Modal from "./Modal";

const TINTS = {
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
const JOB_TONES = { succeeded: "success", running: "info", rejected: "warning", failed: "danger" };

function Tile({ label, value, icon, tint }) {
  return (
    <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800">
      <span className={cx("flex h-7 w-7 items-center justify-center rounded-lg", TINTS[tint])}>
        <Icon name={icon} className="h-3.5 w-3.5" />
      </span>
      <div className="mt-2 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</div>
      <div className={cx("text-xs", muted)}>{label}</div>
    </div>
  );
}

export default function AdminModal({ onClose, onModelChanged }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await api("/api/admin/stats"));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const job = stats?.retrainJob;
  const running = job?.status === "running";

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(async () => {
      const { job: latest } = await api("/api/admin/retrain");
      if (latest.status !== "running") {
        await load();
        onModelChanged();
      } else {
        setStats((current) => ({ ...current, retrainJob: latest }));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [running, load, onModelChanged]);

  async function retrain() {
    setWorking(true);
    setError("");
    try {
      const { job: started } = await api("/api/admin/retrain", { method: "POST" });
      setStats((current) => ({ ...current, retrainJob: started }));
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function reset() {
    if (!window.confirm("Switch back to the original model?")) return;
    await api("/api/admin/model/reset", { method: "POST" });
    await load();
    onModelChanged();
  }

  return (
    <Modal title="Administration" onClose={onClose} wide>
      {!stats && !error && <p className={muted}>Loading…</p>}
      {stats && (
        <div className="space-y-6 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Users" value={stats.users} icon="user" tint="indigo" />
            <Tile label="Analysed emails" value={stats.analysedEmails} icon="mail" tint="indigo" />
            <Tile label="Model says spam" value={stats.modelSpam} icon="flag" tint="rose" />
            <Tile label="Phishing warnings" value={stats.phishing} icon="alert" tint="rose" />
            <Tile label="Reported as spam" value={stats.feedback.spam} icon="flag" tint="amber" />
            <Tile label="Marked not spam" value={stats.feedback.notSpam} icon="thumbsUp" tint="emerald" />
            <Tile label="Deleted" value={stats.actions.deleted} icon="trash" tint="slate" />
            <Tile label="Database" value={stats.database === "mongodb" ? "MongoDB" : "In-memory"} icon="chart" tint="slate" />
          </div>

          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white">Spam model</h3>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Active version <span className="font-mono">{stats.model.version}</span>
              {stats.model.metrics && (
                <>
                  {" "}
                  - accuracy {percent(stats.model.metrics.accuracy)}, precision {percent(stats.model.metrics.precision)},
                  recall {percent(stats.model.metrics.recall)} on {stats.model.metrics.test_emails} test emails
                </>
              )}
            </p>
            <p className={cx("mt-2", muted)}>
              Retraining runs in the background. A new model is only used if it keeps accuracy above 90%.
            </p>
            {job && job.status !== "idle" && (
              <div className={cx(box(JOB_TONES[job.status] || "info"), "mt-3")}>
                <span className="font-semibold capitalize">{job.status}</span>: {job.message}
                {job.finishedAt && <span className="block text-xs opacity-75">Finished {formatDate(job.finishedAt)}</span>}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={retrain} disabled={running || working} className={btn.primary}>
                {running ? "Retraining…" : "Retrain model"}
              </button>
              {stats.model.version !== "base" && (
                <button onClick={reset} className={btn.secondary}>
                  Use original model
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {error && <p className="mt-3 font-medium text-slate-900 dark:text-white">{error}</p>}
    </Modal>
  );
}
