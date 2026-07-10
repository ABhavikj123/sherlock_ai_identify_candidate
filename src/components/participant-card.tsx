"use client";

import { useState } from "react";
import { Mail, Mic, MonitorUp, Save, Trash2, UserRound, Video } from "lucide-react";
import { ScoreRing } from "@/components/score-ring";
import type { ParticipantState } from "@/lib/types";

export type ParticipantPatch = Partial<
  Pick<
    ParticipantState,
    | "displayName"
    | "email"
    | "speakingDuration"
    | "transcript"
    | "webcamOn"
    | "speakerOn"
    | "screenShareOn"
  >
>;

type ParticipantCardProps = {
  disabled: boolean;
  participant: ParticipantState;
  removable: boolean;
  onRemove: (participantId: string) => void;
  onSavePatch: (participantId: string, patch: ParticipantPatch) => Promise<void>;
};

type Drafts = {
  displayName: string;
  email: string;
  speakingDuration: string;
  transcript: string;
};

type ToggleField = "webcamOn" | "speakerOn" | "screenShareOn";

type SavingField = keyof Drafts | ToggleField | null;

export function ParticipantCard({ disabled, participant, removable, onRemove, onSavePatch }: ParticipantCardProps) {
  const [drafts, setDrafts] = useState<Drafts>({
    displayName: participant.displayName,
    email: participant.email,
    speakingDuration: String(participant.speakingDuration),
    transcript: participant.transcript,
  });
  const [savingField, setSavingField] = useState<SavingField>(null);

  async function savePatch(patch: ParticipantPatch, field: SavingField): Promise<void> {
    setSavingField(field);
    await onSavePatch(participant.id, patch);
    setSavingField(null);
  }

  function saveName(): void {
    void savePatch({ displayName: drafts.displayName }, "displayName");
  }

  function saveEmail(): void {
    void savePatch({ email: drafts.email }, "email");
  }

  function saveSpeakingDuration(): void {
    const parsed = Number.parseFloat(drafts.speakingDuration);
    void savePatch(
      { speakingDuration: Number.isFinite(parsed) ? Math.max(0, parsed) : participant.speakingDuration },
      "speakingDuration",
    );
  }

  function saveTranscript(): void {
    void savePatch({ transcript: drafts.transcript }, "transcript");
  }

  function toggle(field: ToggleField): void {
    void savePatch({ [field]: !participant[field] }, field);
  }

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 pt-1">
          <p className="truncate text-sm font-semibold text-zinc-950">
            {participant.displayName || "Unnamed participant"}
          </p>
          <p className="truncate text-xs text-zinc-500">{participant.email || "No email added"}</p>
        </div>
        <ScoreRing score={participant.score} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SimpleField
          current={participant.displayName}
          disabled={disabled}
          icon={<UserRound className="size-4" />}
          label="Name"
          placeholder="Enter name"
          saving={savingField === "displayName"}
          value={drafts.displayName}
          onChange={(value) => setDrafts((current) => ({ ...current, displayName: value }))}
          onSave={saveName}
        />
        <SimpleField
          current={participant.email}
          disabled={disabled}
          icon={<Mail className="size-4" />}
          label="Email"
          placeholder="Enter email"
          saving={savingField === "email"}
          value={drafts.email}
          onChange={(value) => setDrafts((current) => ({ ...current, email: value }))}
          onSave={saveEmail}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ToggleButton
          active={participant.webcamOn}
          disabled={disabled || savingField === "webcamOn"}
          icon={<Video className="size-4" />}
          label="Webcam"
          onClick={() => toggle("webcamOn")}
        />
        <ToggleButton
          active={participant.speakerOn}
          disabled={disabled || savingField === "speakerOn"}
          icon={<Mic className="size-4" />}
          label="Speaking"
          onClick={() => toggle("speakerOn")}
        />
        <ToggleButton
          active={participant.screenShareOn}
          disabled={disabled || savingField === "screenShareOn"}
          icon={<MonitorUp className="size-4" />}
          label="Screen"
          onClick={() => toggle("screenShareOn")}
        />
        {removable ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(participant.id)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="size-4" />
            Remove
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
        <SimpleField
          current={String(participant.speakingDuration)}
          disabled={disabled}
          label="Speaking seconds"
          placeholder="0"
          saving={savingField === "speakingDuration"}
          type="number"
          value={drafts.speakingDuration}
          onChange={(value) => setDrafts((current) => ({ ...current, speakingDuration: value }))}
          onSave={saveSpeakingDuration}
        />
        <TranscriptField
          current={participant.transcript}
          disabled={disabled}
          saving={savingField === "transcript"}
          value={drafts.transcript}
          onChange={(value) => setDrafts((current) => ({ ...current, transcript: value }))}
          onSave={saveTranscript}
        />
      </div>

      <div className="mt-4 grid gap-2 border-t border-zinc-100 pt-3 md:grid-cols-3">
        {participant.reasoning.map((reason) => (
          <p key={reason} className="rounded-md bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">
            {reason}
          </p>
        ))}
      </div>
    </article>
  );
}

type SimpleFieldProps = {
  current: string;
  disabled: boolean;
  icon?: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
  onSave: () => void;
  placeholder: string;
  saving: boolean;
  type?: "number" | "text";
  value: string;
};

function SimpleField({
  current,
  disabled,
  icon,
  label,
  onChange,
  onSave,
  placeholder,
  saving,
  type = "text",
  value,
}: SimpleFieldProps) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-zinc-500">
        {icon}
        {label}
      </div>
      <CurrentText value={current} />
      <div className="mt-2 flex gap-2">
        <input
          disabled={disabled}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "1" : undefined}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-100"
          placeholder={placeholder}
        />
        <SaveButton disabled={disabled || saving} onClick={onSave} tall={false} />
      </div>
    </div>
  );
}

type TranscriptFieldProps = {
  current: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  value: string;
};

function TranscriptField({ current, disabled, onChange, onSave, saving, value }: TranscriptFieldProps) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase text-zinc-500">Transcript</div>
      <CurrentText value={current} multiline />
      <div className="mt-2 flex gap-2">
        <textarea
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-24 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-100"
          placeholder="Enter transcript"
        />
        <SaveButton disabled={disabled || saving} onClick={onSave} tall />
      </div>
    </div>
  );
}

function CurrentText({ value, multiline = false }: { value: string; multiline?: boolean }) {
  return (
    <div
      className={`rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 ${
        multiline ? "min-h-14 whitespace-pre-wrap" : "truncate"
      }`}
    >
      <span className="mr-2 text-xs font-semibold uppercase text-zinc-400">Current</span>
      {value.trim() || "Not added"}
    </div>
  );
}

function SaveButton({ disabled, onClick, tall }: { disabled: boolean; onClick: () => void; tall: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex w-10 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 ${
        tall ? "min-h-24" : "h-10"
      }`}
      title="Save"
    >
      <Save className="size-4" />
    </button>
  );
}

type ToggleButtonProps = {
  active: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

function ToggleButton({ active, disabled, icon, label, onClick }: ToggleButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="text-xs">{active ? "On" : "Off"}</span>
    </button>
  );
}
