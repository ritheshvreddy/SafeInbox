import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { formatDate, percent } from "../labels";
import Modal from "./Modal";

function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
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
      {!stats && !error && <p className="text-slate-500">Loading…</p>}
      {stats && (
        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Users" value={stats.users} />
            <Tile label="Analysed emails" value={stats.analysedEmails} />
            <Tile label="Model says spam" value={stats.modelSpam} />
            <Tile label="Phishing warnings" value={stats.phishing} />
            <Tile label="Reported as spam" value={stats.feedback.spam} />
            <Tile label="Marked not spam" value={stats.feedback.notSpam} />
            <Tile label="Deleted" value={stats.actions.deleted} />
            <Tile label="Database" value={stats.database === "mongodb" ? "MongoDB" : "In-memory"} />
          </div>

          <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <h3 className="font-semibold">Spam model</h3>
            <p className="mt-1">
              Active version: <span className="font-mono">{stats.model.version}</span>
              {stats.model.metrics && (
                <>
                  {" "}
                  - accuracy {percent(stats.model.metrics.accuracy)}, precision {percent(stats.model.metrics.precision)},
                  recall {percent(stats.model.metrics.recall)} on {stats.model.metrics.test_emails} test emails
                </>
              )}
            </p>
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              Retraining runs in the background on the original dataset plus the {stats.feedback.spam + stats.feedback.notSpam}{" "}
              emails users labelled. The new model is only used if it keeps accuracy above 90%.
            </p>
            {job && job.status !== "idle" && (
              <p
                className={`mt-3 rounded-md p-2 ${
                  job.status === "succeeded"
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : job.status === "running"
                    ? "bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300"
                    : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
                }`}
              >
                <strong className="capitalize">{job.status}</strong>: {job.message}
                {job.finishedAt && <span className="block text-xs opacity-75">Finished {formatDate(job.finishedAt)}</span>}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={retrain}
                disabled={running || working}
                className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {running ? "Retraining…" : "Retrain model"}
              </button>
              {stats.model.version !== "base" && (
                <button
                  onClick={reset}
                  className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  Use original model
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {error && <p className="mt-3 text-red-600">{error}</p>}
    </Modal>
  );
}
