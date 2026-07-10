"use client";

import { FormEvent, useState } from "react";
import { Calendar, Mail, Play, UserRound, UsersRound } from "lucide-react";
import type { InterviewInput } from "@/lib/types";

type InterviewFormProps = {
  onStart: (input: InterviewInput) => Promise<void>;
};

export function InterviewForm({ onStart }: InterviewFormProps) {
  const [input, setInput] = useState<InterviewInput>({
    candidateName: "",
    candidateEmail: "",
    calendarInvite: "",
    scheduledAt: "",
    interviewerNames: [""],
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await onStart({
      ...input,
      interviewerNames: input.interviewerNames.map((name) => name.trim()).filter(Boolean),
    });
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-zinc-950">Create Interview</h2>
        <p className="mt-1 text-sm text-zinc-500">Add the metadata available before the meeting starts.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-700">
            <UserRound className="size-4" />
            Candidate name
          </span>
          <input
            required
            value={input.candidateName}
            onChange={(event) => setInput({ ...input, candidateName: event.target.value })}
            className="h-11 w-full rounded-lg border border-zinc-300 px-3 outline-none focus:border-zinc-900"
            placeholder="Candidate full name"
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Mail className="size-4" />
            Candidate email
          </span>
          <input
            required
            type="email"
            value={input.candidateEmail}
            onChange={(event) => setInput({ ...input, candidateEmail: event.target.value })}
            className="h-11 w-full rounded-lg border border-zinc-300 px-3 outline-none focus:border-zinc-900"
            placeholder="candidate@example.com"
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Calendar className="size-4" />
            Schedule
          </span>
          <input
            type="datetime-local"
            value={input.scheduledAt}
            onChange={(event) => setInput({ ...input, scheduledAt: event.target.value })}
            className="h-11 w-full rounded-lg border border-zinc-300 px-3 outline-none focus:border-zinc-900"
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-700">
            <UsersRound className="size-4" />
            Interviewers
          </span>
          <input
            value={input.interviewerNames.join(", ")}
            onChange={(event) =>
              setInput({
                ...input,
                interviewerNames: event.target.value.split(",").map((name) => name.trimStart()),
              })
            }
            className="h-11 w-full rounded-lg border border-zinc-300 px-3 outline-none focus:border-zinc-900"
            placeholder="Name one, name two"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 text-sm font-medium text-zinc-700">Calendar invite or notes</span>
        <textarea
          value={input.calendarInvite}
          onChange={(event) => setInput({ ...input, calendarInvite: event.target.value })}
          className="min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900"
          placeholder="Paste invite text, agenda, meeting link, or known attendees"
        />
      </label>

      <div className="mt-5 flex justify-end">
        <button
          disabled={submitting}
          className="flex h-11 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          <Play className="size-4" />
          {submitting ? "Starting..." : "Start interview"}
        </button>
      </div>
    </form>
  );
}
