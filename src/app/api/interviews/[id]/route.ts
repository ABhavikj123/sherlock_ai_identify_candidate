import { NextResponse } from "next/server";
import { getInterviewState, stopInterview } from "@/lib/interviews";
import { jsonError } from "@/lib/http";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: Params): Promise<NextResponse> {
  const { id } = await context.params;
  const interview = await getInterviewState(id);
  return NextResponse.json({ interview });
}

export async function PATCH(request: Request, context: Params): Promise<NextResponse> {
  const { id } = await context.params;
  const body = (await request.json()) as { action?: unknown };

  if (body.action !== "stop") {
    return jsonError("Unsupported interview action.");
  }

  const interview = await stopInterview(id);
  return NextResponse.json({ interview });
}
