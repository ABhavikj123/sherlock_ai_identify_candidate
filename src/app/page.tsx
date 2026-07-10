"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, History, Radar } from "lucide-react";
import { HistoryPage } from "@/components/history-page";
import { InterviewForm } from "@/components/interview-form";
import { LiveInterview } from "@/components/live-interview";
import type { InterviewInput, InterviewState } from "@/lib/types";

type ViewMode = "live" | "history";

const ACTIVE_KEY = "sherlock.activeInterviewId";

export default function Home() {
  const [view, setView] = useState<ViewMode>("live");
  const [interview, setInterview] = useState<InterviewState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    window.queueMicrotask(() => {
      const activeId = window.localStorage.getItem(ACTIVE_KEY);
      if (!activeId) {
        return;
      }

      setLoading(true);
      fetch(`/api/interviews/${activeId}`)
        .then((response) => response.json() as Promise<{ interview?: InterviewState }>)
        .then((payload) => {
          if (payload.interview?.status === "ACTIVE") {
            setInterview(payload.interview);
          } else {
            window.localStorage.removeItem(ACTIVE_KEY);
          }
        })
        .catch(() => setError("Could not restore the active interview."))
        .finally(() => setLoading(false));
    });
  }, []);

  const navItems = useMemo(
    () => [
      { id: "live" as const, label: "Live", icon: Radar },
      { id: "history" as const, label: "History", icon: History },
    ],
    [],
  );

  async function startInterview(input: InterviewInput): Promise<void> {
    setError("");
    const response = await fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const payload = (await response.json()) as { interview?: InterviewState; error?: string };
    if (!response.ok || !payload.interview) {
      setError(payload.error ?? "Could not start interview.");
      return;
    }

    window.localStorage.setItem(ACTIVE_KEY, payload.interview.id);
    setInterview(payload.interview);
    setView("live");
  }

  function finishInterview(next: InterviewState): void {
    window.localStorage.removeItem(ACTIVE_KEY);
    setInterview(next.status === "ACTIVE" ? next : null);
    setView(next.status === "ACTIVE" ? "live" : "history");
  }

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <nav className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-zinc-950 text-white">
              <Brain className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-normal">Sherlock Candidate ID</h1>
              <p className="text-xs text-zinc-500">Realtime interview identity scoring</p>
            </div>
          </div>
          <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition ${
                    selected ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-950"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">Loading workspace...</div>
        ) : view === "history" ? (
          <HistoryPage />
        ) : interview ? (
          <LiveInterview
            key={interview.id}
            interview={interview}
            onInterviewChange={setInterview}
            onFinished={finishInterview}
          />
        ) : (
          <InterviewForm onStart={startInterview} />
        )}
      </section>
    </main>
  );
}
