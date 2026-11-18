import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Check,
  CircleAlert,
  Clock3,
  Cpu,
  Gauge,
  Layers3,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Server,
  SkipForward,
  Trash2,
  Zap,
} from "lucide-react";

interface ProcessInput {
  processId: string;
  burstTime: string;
}

interface ProcessResult {
  processId: string;
  burstTime: number;
  startTime: number;
  completionTime: number;
  waitingTime: number;
  turnaroundTime: number;
}

interface FCFSResponse {
  results: ProcessResult[];
  averageWaitingTime: number;
  averageTurnaroundTime: number;
  totalExecutionTime: number;
}

type BackendStatus = "checking" | "online" | "offline";
type RunMode = "continuous" | "step";

const INITIAL_PROCESSES: ProcessInput[] = [
  { processId: "P1", burstTime: "5" },
  { processId: "P2", burstTime: "3" },
  { processId: "P3", burstTime: "8" },
];

const EXECUTION_DURATION_MS = 2200;

function formatTime(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function App() {
  const [processes, setProcesses] = useState<ProcessInput[]>(INITIAL_PROCESSES);
  const [results, setResults] = useState<FCFSResponse | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");

  const executionProgressRef = useRef(0);
  const runModeRef = useRef<RunMode>("continuous");

  // Check whether the PHP API is reachable.
  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health.php", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API health check failed");
        return response.json() as Promise<{ status?: string }>;
      })
      .then((data) => {
        setBackendStatus(data.status === "ok" ? "online" : "offline");
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        setBackendStatus("offline");
      });

    return () => controller.abort();
  }, []);

  // Run one process at a time. Progress is preserved when paused.
  useEffect(() => {
    if (!isPlaying || !results) return;

    let finishTimer: number | undefined;
    const startAt =
      Date.now() - executionProgressRef.current * EXECUTION_DURATION_MS;

    const interval = window.setInterval(() => {
      const nextProgress = Math.min(
        (Date.now() - startAt) / EXECUTION_DURATION_MS,
        1,
      );

      executionProgressRef.current = nextProgress;
      setExecutionProgress(nextProgress);

      if (nextProgress >= 1) {
        window.clearInterval(interval);

        finishTimer = window.setTimeout(() => {
          const nextCompletedCount = completedCount + 1;
          const allDone = nextCompletedCount >= results.results.length;
          const singleStep = runModeRef.current === "step";

          executionProgressRef.current = 0;
          setExecutionProgress(0);
          setCompletedCount(nextCompletedCount);

          if (singleStep || allDone) {
            setIsPlaying(false);
            setIsPaused(false);
          }
        }, 260);
      }
    }, 40);

    return () => {
      window.clearInterval(interval);
      if (finishTimer !== undefined) {
        window.clearTimeout(finishTimer);
      }
    };
  }, [isPlaying, results, completedCount]);

  const invalidateResults = () => {
    setResults(null);
    setCompletedCount(0);
    executionProgressRef.current = 0;
    setExecutionProgress(0);
    setIsPlaying(false);
    setIsPaused(false);
    setError("");
  };

  const addProcess = () => {
    if (processes.length >= 50) return;

    const highestId = processes.reduce((highest, process) => {
      const idNumber = Number(process.processId.replace(/^P/i, ""));
      return Math.max(highest, Number.isFinite(idNumber) ? idNumber : 0);
    }, 0);

    setProcesses((current) => [
      ...current,
      { processId: `P${highestId + 1}`, burstTime: "1" },
    ]);
    invalidateResults();
  };

  const updateBurstTime = (index: number, value: string) => {
    setProcesses((current) =>
      current.map((process, processIndex) =>
        processIndex === index ? { ...process, burstTime: value } : process,
      ),
    );
    invalidateResults();
  };

  const removeProcess = (index: number) => {
    setProcesses((current) => current.filter((_, processIndex) => processIndex !== index));
    invalidateResults();
  };

  const resetInputs = () => {
    setProcesses(INITIAL_PROCESSES);
    invalidateResults();
  };

  const calculateFCFS = async () => {
    setError("");

    if (processes.length === 0) {
      setError("Add at least one process before calculating.");
      return;
    }

    const hasInvalidBurstTime = processes.some((process) => {
      const burstTime = Number(process.burstTime);
      return (
        process.burstTime.trim() === "" ||
        !Number.isFinite(burstTime) ||
        burstTime <= 0
      );
    });

    if (hasInvalidBurstTime) {
      setError("Every burst time must be a number greater than zero.");
      return;
    }

    if (processes.length > 50) {
      setError("A maximum of 50 processes is allowed.");
      return;
    }

    setIsLoading(true);
    setIsPlaying(false);
    setIsPaused(false);
    setResults(null);
    setCompletedCount(0);
    executionProgressRef.current = 0;
    setExecutionProgress(0);

    try {
      const response = await fetch("/api/fcfs.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processes: processes.map((process) => ({
            processId: process.processId,
            burstTime: Number(process.burstTime),
          })),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | (FCFSResponse & { message?: string })
        | null;

      if (
        !response.ok ||
        !data ||
        !Array.isArray(data.results) ||
        data.results.length !== processes.length ||
        !Number.isFinite(data.averageWaitingTime) ||
        !Number.isFinite(data.averageTurnaroundTime) ||
        !Number.isFinite(data.totalExecutionTime)
      ) {
        throw new Error(data?.message || "The PHP API could not calculate FCFS.");
      }

      setResults(data);
      setBackendStatus("online");
    } catch (requestError) {
      setBackendStatus("offline");
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not connect to the PHP backend.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSimulation = () => {
    if (!results) return;

    if (isPlaying) {
      setIsPlaying(false);
      setIsPaused(true);
      return;
    }

    if (completedCount >= results.results.length) {
      setCompletedCount(0);
      executionProgressRef.current = 0;
      setExecutionProgress(0);
    }

    runModeRef.current = "continuous";
    setIsPaused(false);
    setIsPlaying(true);
  };

  const executeStep = () => {
    if (!results || isPlaying || completedCount >= results.results.length) return;

    runModeRef.current = "step";
    setIsPaused(false);
    setIsPlaying(true);
  };

  const resetSimulation = () => {
    setIsPlaying(false);
    setIsPaused(false);
    setCompletedCount(0);
    executionProgressRef.current = 0;
    setExecutionProgress(0);
    runModeRef.current = "continuous";
  };

  const totalProcesses = results?.results.length ?? 0;
  const isFinished = !!results && totalProcesses > 0 && completedCount >= totalProcesses;
  const currentProcess = results && !isFinished ? results.results[completedCount] : null;
  const finishedProcesses = results?.results.slice(0, completedCount) ?? [];
  const waitingProcesses = results
    ? results.results.slice(completedCount + (currentProcess ? 1 : 0))
    : processes.map((process) => ({
        ...process,
        burstTime: Number(process.burstTime) || 0,
      }));

  const totalBurstTime = processes.reduce(
    (total, process) => total + (Number(process.burstTime) || 0),
    0,
  );

  const overallProgress = results
    ? ((completedCount + (isPlaying || isPaused ? executionProgress : 0)) / totalProcesses) * 100
    : 0;

  const statusLabel = isFinished
    ? "Completed"
    : isPlaying
      ? "Running"
      : isPaused
        ? "Paused"
        : results
          ? "Ready to start"
          : "Ready";

  const currentProcessStatus = isPlaying
    ? "Running"
    : isPaused
      ? "Paused"
      : "Ready";

  const playButtonLabel = isPlaying
    ? "Pause"
    : isFinished
      ? "Replay"
      : isPaused || completedCount > 0
        ? "Resume"
        : "Start simulation";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top" aria-label="FCFS Scheduler home">
            <span className="brand-mark"><Cpu size={21} strokeWidth={2.2} /></span>
            <span className="brand-copy">
              <strong>FCFS Scheduler</strong>
              <small>CPU Scheduling Simulator</small>
            </span>
          </a>

          <div className="topbar-right">
            <span className={`api-indicator api-${backendStatus}`}>
              <span className="api-dot" />
              {backendStatus === "checking"
                ? "Checking PHP API"
                : backendStatus === "online"
                  ? "PHP API connected"
                  : "PHP API offline"}
            </span>
          </div>
        </div>
      </header>

      <main className="main-container" id="top">
        <section className="page-heading">
          <div>
            <h1>First-Come, First-Served Scheduling</h1>
            <p>Add processes, calculate the schedule, and watch the CPU execute them in order.</p>
          </div>
          <div className="heading-note">
            <span className="heading-note-icon"><Gauge size={17} /></span>
            <span><strong>Non-preemptive</strong><small>Arrival time: 0 for all processes</small></span>
          </div>
        </section>

        <section className="summary-grid" aria-label="Scheduling overview">
          <article className="summary-card">
            <span className="summary-icon summary-icon-blue"><Layers3 size={19} /></span>
            <div className="summary-content">
              <span className="summary-label">Processes</span>
              <strong>{processes.length}</strong>
            </div>
          </article>

          <article className="summary-card">
            <span className="summary-icon summary-icon-violet"><Clock3 size={19} /></span>
            <div className="summary-content">
              <span className="summary-label">Total burst time</span>
              <strong>{formatTime(totalBurstTime)}</strong>
            </div>
          </article>

          <article className="summary-card">
            <span className="summary-icon summary-icon-green"><BadgeCheck size={19} /></span>
            <div className="summary-content">
              <span className="summary-label">Completed</span>
              <strong>{completedCount} / {results?.results.length ?? processes.length}</strong>
            </div>
          </article>
        </section>

        <div className="workspace-grid">
          <section className="panel process-panel">
            <div className="panel-heading">
              <div>
                <h2>Process inputs</h2>
                <p className="panel-subtitle">Enter a burst time for each process.</p>
              </div>
              <span className="panel-count">{processes.length}</span>
            </div>

            <div className="input-table-heading">
              <span>Process</span>
              <span>Burst time</span>
              <span aria-hidden="true" />
            </div>

            <div className="input-list">
              {processes.map((process, index) => (
                <div className="input-row" key={process.processId}>
                  <div className="input-process-name">
                    <strong>{process.processId}</strong>
                  </div>
                  <label className="burst-field">
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={process.burstTime}
                      onChange={(event) => updateBurstTime(index, event.target.value)}
                      aria-label={`Burst time for ${process.processId}`}
                      placeholder="e.g. 5"
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button remove-button"
                    onClick={() => removeProcess(index)}
                    aria-label={`Remove ${process.processId}`}
                    title="Remove process"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {processes.length === 0 && (
                <div className="empty-state input-empty-state">
                  <Layers3 size={27} />
                  <strong>No processes yet</strong>
                  <span>Add a process to start building your queue.</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="add-process-button"
              onClick={addProcess}
              disabled={processes.length >= 50}
            >
              <Plus size={17} /> Add process
            </button>

            {error && (
              <div className="error-banner" role="alert">
                <CircleAlert size={17} />
                <span>{error}</span>
              </div>
            )}

            {backendStatus === "offline" && !error && (
              <div className="notice-banner">
                <Server size={17} />
                <span>Start the PHP server to calculate scheduling results.</span>
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="button button-primary calculate-button"
                onClick={calculateFCFS}
                disabled={isLoading || processes.length === 0}
              >
                <Zap size={17} />
                {isLoading ? "Calculating..." : "Calculate schedule"}
              </button>
              <button type="button" className="button button-quiet" onClick={resetInputs}>
                <RotateCcw size={16} /> Reset inputs
              </button>
            </div>
          </section>

          <section className="panel monitor-panel">
            <div className="panel-heading monitor-heading">
              <div>
                <h2>CPU simulation</h2>
                <p className="panel-subtitle">Track the current process and the queue.</p>
              </div>
              <span className={`run-status ${isPlaying ? "run-status-live" : isFinished ? "run-status-done" : ""}`}>
                <span className="run-status-dot" /> {statusLabel}
              </span>
            </div>

            <div className="execution-progress">
              <div className="progress-topline">
                <span>Overall progress</span>
                <strong>{Math.round(overallProgress)}%</strong>
              </div>
              <div className="progress-rail">
                <div className="progress-value" style={{ width: `${overallProgress}%` }} />
              </div>
              <div className="progress-footline">
                <span>{completedCount} completed</span>
                <span>{results ? totalProcesses - completedCount : processes.length} remaining</span>
              </div>
            </div>

            <div className="execution-grid">
              <article className={`cpu-card ${currentProcess ? "cpu-card-engaged" : isFinished ? "cpu-card-complete" : ""}`}>
                <div className="cpu-card-heading">
                  <span className="cpu-symbol"><Cpu size={22} /></span>
                  <span className="cpu-heading-text">CPU</span>
                </div>

                {currentProcess ? (
                  <>
                    <div className="cpu-main-info">
                      <div>
                        <span className="cpu-caption">{isPlaying ? "Currently executing" : isPaused ? "Execution paused" : "Up next"}</span>
                        <h3>{currentProcess.processId}</h3>
                      </div>
                      <span className={`process-state ${isPlaying ? "state-running" : isPaused ? "state-paused" : "state-ready"}`}>
                        <span /> {currentProcessStatus}
                      </span>
                    </div>

                    <div className="cpu-data-row">
                      <span>Burst time</span>
                      <strong>{formatTime(currentProcess.burstTime)} <small>units</small></strong>
                    </div>

                    <div className="cpu-progress-track">
                      <div className="cpu-progress-value" style={{ width: `${(isPlaying || isPaused) ? executionProgress * 100 : 0}%` }} />
                    </div>
                    <p className="cpu-helper-text">
                      {isPlaying
                        ? "The CPU is processing this task."
                        : isPaused
                          ? "Paused. Resume to continue."
                          : "This process will run next."}
                    </p>
                  </>
                ) : (
                  <div className="cpu-idle-state">
                    <span className="idle-icon">{isFinished ? <Check size={23} /> : <Cpu size={23} />}</span>
                    <h3>{isFinished ? "Execution complete" : "CPU is idle"}</h3>
                    <p>{isFinished ? "All processes have finished." : "Calculate the schedule to prepare the queue."}</p>
                  </div>
                )}
              </article>

              <article className="ready-queue-card">
                <div className="queue-card-heading">
                  <div>
                    <h3>Ready queue</h3>
                  </div>
                  <span className="queue-number">{waitingProcesses.length}</span>
                </div>

                <div className="ready-list">
                  {waitingProcesses.length > 0 ? (
                    waitingProcesses.map((process, index) => (
                      <div className="ready-item" key={process.processId}>
                        <div className="ready-process-copy">
                          <strong>{process.processId}</strong>
                          <span>Burst time: {formatTime(process.burstTime)}</span>
                        </div>
                        <span className={`queue-state ${index === 0 ? "queue-state-next" : ""}`}>
                          {index === 0 ? "Next" : "Waiting"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state queue-empty-state">
                      <BadgeCheck size={25} />
                      <strong>{isFinished ? "Queue completed" : "No waiting processes"}</strong>
                      <span>{isFinished ? "Every process has been executed." : "There are no processes waiting."}</span>
                    </div>
                  )}
                </div>
              </article>
            </div>

            <div className="completed-card">
              <div className="completed-card-heading">
                <div>
                  <h3>Completed processes</h3>
                </div>
                <span>{finishedProcesses.length}</span>
              </div>

              {finishedProcesses.length > 0 ? (
                <div className="completed-list">
                  {finishedProcesses.map((process) => (
                    <span className="completed-chip" key={process.processId}>
                      <BadgeCheck size={15} />
                      {process.processId}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="completed-placeholder">
                  No completed processes yet.
                </div>
              )}
            </div>

            <div className="control-bar">
              <div className="control-copy">
                <strong>Simulation controls</strong>
                <span>{completedCount} of {totalProcesses || processes.length} completed</span>
              </div>

              <div className="control-actions">
                <button
                  type="button"
                  className="button button-icon"
                  onClick={resetSimulation}
                  disabled={!results || (completedCount === 0 && !isPlaying && !isPaused && executionProgress === 0)}
                  title="Reset simulation"
                  aria-label="Reset simulation"
                >
                  <RotateCcw size={17} />
                </button>

                <button
                  type="button"
                  className="button button-icon"
                  onClick={executeStep}
                  disabled={!results || isPlaying || isFinished}
                  title="Execute one process"
                  aria-label="Execute one process"
                >
                  <SkipForward size={18} />
                </button>

                <button
                  type="button"
                  className="button button-primary play-button"
                  onClick={toggleSimulation}
                  disabled={!results}
                >
                  {isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
                  {playButtonLabel}
                </button>
              </div>
            </div>
          </section>
        </div>

        {isFinished && results && (
          <section className="results-section">
            <div className="results-intro">
              <div>
                <h2>Scheduling results</h2>
                <p>Final results for the current process order.</p>
              </div>
            </div>

            <div className="result-metrics">
              <article className="result-card">
                <span className="result-icon result-icon-blue"><Clock3 size={18} /></span>
                <span className="result-label">Average waiting time</span>
                <strong>{results.averageWaitingTime.toFixed(2)}</strong>
              </article>
              <article className="result-card">
                <span className="result-icon result-icon-violet"><Activity size={18} /></span>
                <span className="result-label">Average turnaround time</span>
                <strong>{results.averageTurnaroundTime.toFixed(2)}</strong>
              </article>
              <article className="result-card">
                <span className="result-icon result-icon-green"><Gauge size={18} /></span>
                <span className="result-label">Total execution time</span>
                <strong>{formatTime(results.totalExecutionTime)}</strong>
              </article>
            </div>

            <article className="results-panel">
              <div className="results-panel-heading">
                <div>
                  <h3>Gantt chart</h3>
                  <p>Each block shows a process and its execution interval.</p>
                </div>
                <span className="chart-legend"><span /> CPU execution</span>
              </div>

              <div className="gantt-scroll">
                <div className="gantt-track">
                  {results.results.map((process, index) => (
                    <div
                      className={`gantt-block ${index % 2 === 0 ? "gantt-block-indigo" : "gantt-block-slate"}`}
                      key={process.processId}
                      style={{ flexGrow: Math.max(process.burstTime, 0.1), flexBasis: "0%" }}
                      title={`${process.processId}: ${formatTime(process.startTime)} to ${formatTime(process.completionTime)}`}
                    >
                      <strong>{process.processId}</strong>
                      <span>{formatTime(process.startTime)} – {formatTime(process.completionTime)}</span>
                    </div>
                  ))}
                </div>
                <div className="gantt-axis">
                  <span>0</span>
                  <span>{formatTime(results.totalExecutionTime)}</span>
                </div>
              </div>
            </article>

            <article className="results-panel table-panel">
              <div className="results-panel-heading">
                <div>
                  <h3>Process breakdown</h3>
                </div>
              </div>

              <div className="table-scroll">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Process</th>
                      <th>Burst time</th>
                      <th>Start time</th>
                      <th>Completion time</th>
                      <th>Waiting time</th>
                      <th>Turnaround time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((process) => (
                      <tr key={process.processId}>
                        <td><span className="table-process-id">{process.processId}</span></td>
                        <td>{formatTime(process.burstTime)}</td>
                        <td>{formatTime(process.startTime)}</td>
                        <td>{formatTime(process.completionTime)}</td>
                        <td className="table-accent">{formatTime(process.waitingTime)}</td>
                        <td className="table-emphasis">{formatTime(process.turnaroundTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Average</td>
                      <td className="table-accent">{results.averageWaitingTime.toFixed(2)}</td>
                      <td className="table-emphasis">{results.averageTurnaroundTime.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </article>
          </section>
        )}

      </main>
    </div>
  );
}

export default App;

