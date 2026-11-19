import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { formatDate, percent } from "../labels";
import { btn, cx, muted, notice } from "../ui";
import Modal from "./Modal";

function Tile({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className={cx("text-xs", muted)}>{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</div>
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
            <Tile label="Users" value={stats.users} />
            <Tile label="Analysed emails" value={stats.analysedEmails} />
            <Tile label="Model says spam" value={stats.modelSpam} />
            <Tile label="Phishing warnings" value={stats.phishing} />
            <Tile label="Reported as spam" value={stats.feedback.spam} />
            <Tile label="Marked not spam" value={stats.feedback.notSpam} />
            <Tile label="Deleted" value={stats.actions.deleted} />
            <Tile label="Database" value={stats.database === "mongodb" ? "MongoDB" : "In-memory"} />
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
              <div className={cx(notice, "mt-3")}>
                <span className="font-medium capitalize text-slate-900 dark:text-white">{job.status}</span>: {job.message}
                {job.finishedAt && <span className={cx("block text-xs", muted)}>Finished {formatDate(job.finishedAt)}</span>}
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
