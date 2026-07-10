"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Square } from "lucide-react";
import { ParticipantCard, type ParticipantPatch } from "@/components/participant-card";
import type { InterviewState, ParticipantState } from "@/lib/types";

type LiveInterviewProps = {
  interview: InterviewState;
  onInterviewChange: (interview: InterviewState) => void;
  onFinished: (interview: InterviewState) => void;
};

export function LiveInterview({ interview, onInterviewChange, onFinished }: LiveInterviewProps) {
  const [current, setCurrent] = useState(interview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentRef = useRef(interview);
  const mutationCounterRef = useRef(0);
  const pendingMutationsRef = useRef<Map<string, number>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const socketReadyRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/api/interviews/${interview.id}/socket`);
    socketRef.current = socket;
    socketReadyRef.current = false;

    socket.addEventListener("open", () => {
      socketReadyRef.current = true;
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          type?: string;
          interview?: InterviewState;
          error?: string;
        };

        if ((payload.type === "state" || payload.type === "scores") && payload.interview) {
          publish(payload.interview, "server");
          return;
        }

        if (payload.type === "error" && payload.error) {
          setError(payload.error);
        }
      } catch {
        // for now, ignore malformed socket messages.
      }
    });

    return () => {
      socketReadyRef.current = false;
      socket.close();
      socketRef.current = null;
    };
  }, [interview.id]);

  function publish(next: InterviewState, source: "local" | "server"): void {
    const prepared = source === "server" ? preservePendingParticipantInputs(currentRef.current, next, pendingMutationsRef.current) : next;
    const ordered = preserveParticipantOrder(currentRef.current, prepared);
    currentRef.current = ordered;
    setCurrent(ordered);
    onInterviewChange(ordered);
  }

  async function saveParticipantPatch(participantId: string, patch: ParticipantPatch): Promise<void> {
    const base = currentRef.current;
    const existing = base.participants.find((participant) => participant.id === participantId);
    if (!existing) {
      setError("Participant was not found.");
      return;
    }

    const participant: ParticipantState = { ...existing, ...patch };
    const optimistic: InterviewState = {
      ...base,
      participants: base.participants.map((item) => (item.id === participantId ? participant : item)),
    };
    const mutationVersion = mutationCounterRef.current + 1;
    mutationCounterRef.current = mutationVersion;
    pendingMutationsRef.current.set(participantId, mutationVersion);

    setError("");
    publish(optimistic, "local");

    try {
      const socket = socketRef.current;
      if (socket && socketReadyRef.current && socket.readyState === WebSocket.OPEN) {
        const responsePromise = waitForSocketInterviewUpdate(socket);
        socket.send(
          JSON.stringify({
            type: "participant:update",
            interviewId: base.id,
            participant,
          }),
        );

        const response = await responsePromise;

        if (pendingMutationsRef.current.get(participantId) !== mutationVersion) {
          return;
        }

        pendingMutationsRef.current.delete(participantId);
        if (response) {
          publish(response, "server");
        }
        return;
      }

      setError("Live socket is not ready yet.");
    } catch {
      setError("Could not save participant update. Try again.");
    } finally {
      if (pendingMutationsRef.current.get(participantId) === mutationVersion) {
        pendingMutationsRef.current.delete(participantId);
      }
    }
  }

  async function addParticipant(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/interviews/${currentRef.current.id}/participants`, { method: "POST" });
      const payload = (await response.json()) as { interview?: InterviewState; error?: string };

      if (!response.ok || !payload.interview) {
        setError(payload.error ?? "Could not add participant.");
        return;
      }

      publish(payload.interview, "server");
    } catch {
      setError("Could not add participant.");
    } finally {
      setBusy(false);
    }
  }

  async function removeParticipant(participantId: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/interviews/${currentRef.current.id}/participants/${participantId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { interview?: InterviewState; error?: string };

      if (!response.ok || !payload.interview) {
        setError(payload.error ?? "Could not remove participant.");
        return;
      }

      publish(payload.interview, "server");
    } catch {
      setError("Could not remove participant.");
    } finally {
      setBusy(false);
    }
  }

  async function stopInterview(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/interviews/${currentRef.current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const payload = (await response.json()) as { interview?: InterviewState; error?: string };

      if (!response.ok || !payload.interview) {
        setError(payload.error ?? "Could not stop interview.");
        setBusy(false);
        return;
      }

      onFinished(payload.interview);
    } catch {
      setError("Could not stop interview.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Interview Started</h2>
            <p className="text-sm text-zinc-500">
              Candidate target: {current.candidateName} ({current.candidateEmail})
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={addParticipant}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="size-4" />
            Add participant
          </button>
        </div>

        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {current.participants.map((participant) => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            disabled={busy}
            removable={current.participants.length > 2}
            onRemove={removeParticipant}
            onSavePatch={saveParticipantPatch}
          />
        ))}
      </div>

      <div className="fixed bottom-5 right-5">
        <button
          type="button"
          disabled={busy}
          onClick={stopInterview}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white shadow-lg hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-500"
        >
          <Square className="size-4 fill-current" />
          {busy ? "Working..." : "Stop interview"}
        </button>
      </div>
    </div>
  );
}

function waitForSocketInterviewUpdate(socket: WebSocket, timeoutMs = 5000): Promise<InterviewState | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          type?: string;
          interview?: InterviewState;
        };

        if ((payload.type === "scores" || payload.type === "state") && payload.interview) {
          socket.removeEventListener("message", onMessage);
          window.clearTimeout(timer);
          resolve(payload.interview);
        }
      } catch {
        // For now, ignore malformed socket messages.
      }
    };

    socket.addEventListener("message", onMessage);
  });
}

function preserveParticipantOrder(previous: InterviewState, next: InterviewState): InterviewState {
  const nextById = new Map(next.participants.map((participant) => [participant.id, participant]));
  const ordered = previous.participants
    .map((participant) => nextById.get(participant.id))
    .filter((participant): participant is ParticipantState => Boolean(participant));
  const knownIds = new Set(ordered.map((participant) => participant.id));
  const newParticipants = next.participants.filter((participant) => !knownIds.has(participant.id));

  return {
    ...next,
    participants: [...ordered, ...newParticipants],
  };
}

function preservePendingParticipantInputs(
  previous: InterviewState,
  next: InterviewState,
  pendingMutations: Map<string, number>,
): InterviewState {
  const previousById = new Map(previous.participants.map((participant) => [participant.id, participant]));

  return {
    ...next,
    participants: next.participants.map((participant) => {
      if (!pendingMutations.has(participant.id)) {
        return participant;
      }

      const latest = previousById.get(participant.id);
      if (!latest) {
        return participant;
      }

      return {
        ...participant,
        displayName: latest.displayName,
        email: latest.email,
        webcamOn: latest.webcamOn,
        speakerOn: latest.speakerOn,
        screenShareOn: latest.screenShareOn,
        speakingDuration: latest.speakingDuration,
        transcript: latest.transcript,
      };
    }),
  };
}
