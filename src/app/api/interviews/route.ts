import { NextResponse } from "next/server";
import { createInterview, listCompletedInterviews } from "@/lib/interviews";
import { isNonEmptyString, jsonError } from "@/lib/http";
import type { InterviewInput } from "@/lib/types";

type CreateInterviewBody = {
  candidateName?: unknown;
  candidateEmail?: unknown;
  calendarInvite?: unknown;
  scheduledAt?: unknown;
  interviewerNames?: unknown;
};

export async function GET(): Promise<NextResponse> {
  const interviews = await listCompletedInterviews();
  return NextResponse.json({ interviews });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as CreateInterviewBody;

  if (!isNonEmptyString(body.candidateName) || !isNonEmptyString(body.candidateEmail)) {
    return jsonError("Candidate name and email are required.");
  }

  const interviewerNames = Array.isArray(body.interviewerNames)
    ? body.interviewerNames.filter((item): item is string => typeof item === "string")
    : [];

  const input: InterviewInput = {
    candidateName: body.candidateName,
    candidateEmail: body.candidateEmail,
    calendarInvite: typeof body.calendarInvite === "string" ? body.calendarInvite : "",
    scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : "",
    interviewerNames,
  };

  const interview = await createInterview(input);
  return NextResponse.json({ interview }, { status: 201 });
}
