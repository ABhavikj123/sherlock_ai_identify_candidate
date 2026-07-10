import { NextResponse } from "next/server";
import { updateParticipant } from "@/lib/interviews";
import { jsonError } from "@/lib/http";
import type { ParticipantState } from "@/lib/types";

type Params = {
  params: Promise<{ id: string }>;
};

type EventBody = {
  participant?: unknown;
};

export async function POST(request: Request, context: Params): Promise<NextResponse> {
  const { id } = await context.params;
  const body = (await request.json()) as EventBody;

  if (!isParticipantState(body.participant)) {
    return jsonError("Valid participant payload is required.");
  }

  const result = await updateParticipant(id, body.participant);
  return NextResponse.json(result);
}

function isParticipantState(value: unknown): value is ParticipantState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.displayName === "string" &&
    typeof record.email === "string" &&
    typeof record.webcamOn === "boolean" &&
    typeof record.speakerOn === "boolean" &&
    typeof record.screenShareOn === "boolean" &&
    typeof record.speakingDuration === "number" &&
    typeof record.transcript === "string" &&
    typeof record.textIntent === "number" &&
    typeof record.score === "number" &&
    Array.isArray(record.reasoning)
  );
}
