"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { ScoreRing } from "@/components/score-ring";
import type { InterviewState } from "@/lib/types";

export function HistoryPage() {
  const [interviews, setInterviews] = useState<InterviewState[]>([]);
  const [loading, setLoading] = useState(true);
  const [trainingId, setTrainingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [selectedTruth, setSelectedTruth] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function loadHistory(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/interviews");
      const payload = (await response.json()) as { interviews?: InterviewState[] };
      setInterviews(payload.interviews ?? []);
    } catch {
      setError("Could not load interview history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    window.queueMicrotask(() => {
      void loadHistory();
    });
  }, []);

  async function train(interview: InterviewState): Promise<void> {
    const trueCandidateId = selectedTruth[interview.id];
    if (!trueCandidateId) {
      setError("Select the true candidate before training.");
      return;
    }

    setTrainingId(interview.id);
    setError("");
    try {
      const response = await fetch("/api/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId: interview.id,
          trueCandidateId,
          reviewNotes: reviewNotes[interview.id] ?? "",
        }),
      });
      const payload = (await response.json()) as { interview?: InterviewState; error?: string };
      if (!response.ok || !payload.interview) {
        setError(payload.error ?? "Training failed.");
        return;
      }

      setInterviews((current) => current.map((item) => (item.id === payload.interview?.id ? payload.interview : item)));
    } catch {
      setError("Training failed.");
    } finally {
      setTrainingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Interview History</h2>
          <p className="text-sm text-zinc-500">Review completed interviews before updating model weights.</p>
        </div>
        <button
          type="button"
          onClick={loadHistory}
          className="flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-500">Loading history...</div>
      ) : interviews.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
          Completed interviews will appear here after stopping a live interview.
        </div>
      ) : (
        interviews.map((interview) => (
          <HistoryItem
            key={interview.id}
            interview={interview}
            selectedTruth={selectedTruth[interview.id] ?? ""}
            reviewNotes={reviewNotes[interview.id] ?? ""}
            training={trainingId === interview.id}
            onTruthChange={(participantId) =>
              setSelectedTruth((current) => ({ ...current, [interview.id]: participantId }))
            }
            onNotesChange={(notes) => setReviewNotes((current) => ({ ...current, [interview.id]: notes }))}
            onTrain={() => train(interview)}
          />
        ))
      )}
    </div>
  );
}

type HistoryItemProps = {
  interview: InterviewState;
  selectedTruth: string;
  reviewNotes: string;
  training: boolean;
  onTruthChange: (participantId: string) => void;
  onNotesChange: (notes: string) => void;
  onTrain: () => void;
};

function HistoryItem({
  interview,
  selectedTruth,
  reviewNotes,
  training,
  onTruthChange,
  onNotesChange,
  onTrain,
}: HistoryItemProps) {
  const predicted = useMemo(() => {
    return interview.participants.find((participant) => participant.id === interview.finalPredictionId) ?? null;
  }, [interview.finalPredictionId, interview.participants]);

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-950">{interview.candidateName}</h3>
          <p className="text-sm text-zinc-500">
            Predicted: {predicted?.displayName || predicted?.email || "Unnamed participant"}
          </p>
        </div>
        <span
          className={`inline-flex h-8 items-center gap-2 self-start rounded-lg px-3 text-sm font-semibold ${
            interview.status === "TRAINED" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-700"
          }`}
        >
          {interview.status === "TRAINED" ? <CheckCircle2 className="size-4" /> : <SlidersHorizontal className="size-4" />}
          {interview.status === "TRAINED" ? "Training finished" : "Review needed"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {interview.participants.map((participant) => (
          <label
            key={participant.id}
            className={`flex cursor-pointer items-center gap-4 rounded-lg border p-3 ${
              selectedTruth === participant.id ? "border-zinc-950 bg-zinc-50" : "border-zinc-200"
            }`}
          >
            <input
              type="radio"
              name={`truth-${interview.id}`}
              disabled={interview.status === "TRAINED"}
              checked={selectedTruth === participant.id || interview.trueCandidateId === participant.id}
              onChange={() => onTruthChange(participant.id)}
              className="size-4 accent-zinc-950"
            />
            <ScoreRing score={participant.score} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-950">
                {participant.displayName || "Unnamed participant"}
              </p>
              <p className="truncate text-sm text-zinc-500">{participant.email || "No email"}</p>
              <p className="mt-1 text-xs text-zinc-500">Text intent {Math.round(participant.textIntent * 100)}%</p>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <textarea
          disabled={interview.status === "TRAINED"}
          value={reviewNotes}
          onChange={(event) => onNotesChange(event.target.value)}
          className="min-h-20 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-100"
          placeholder="Reviewer notes before training"
        />
        <button
          type="button"
          disabled={interview.status === "TRAINED" || training}
          onClick={onTrain}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 md:self-end"
        >
          <SlidersHorizontal className="size-4" />
          {training ? "Training..." : "Train model"}
        </button>
      </div>
    </article>
  );
}
