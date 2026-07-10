import { NextResponse } from "next/server";
import { isNonEmptyString, jsonError } from "@/lib/http";
import { trainInterview } from "@/lib/interviews";
import type { TrainRequest } from "@/lib/types";

type TrainBody = {
  interviewId?: unknown;
  trueCandidateId?: unknown;
  reviewNotes?: unknown;
};

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as TrainBody;

  if (!isNonEmptyString(body.interviewId) || !isNonEmptyString(body.trueCandidateId)) {
    return jsonError("Interview and true candidate are required.");
  }

  const input: TrainRequest = {
    interviewId: body.interviewId,
    trueCandidateId: body.trueCandidateId,
    reviewNotes: typeof body.reviewNotes === "string" ? body.reviewNotes : "",
  };

  const interview = await trainInterview(input);
  return NextResponse.json({ interview });
}
