import { NextResponse } from "next/server";
import { removeParticipant } from "@/lib/interviews";

type Params = {
  params: Promise<{ id: string; participantId: string }>;
};

export async function DELETE(_request: Request, context: Params): Promise<NextResponse> {
  const { id, participantId } = await context.params;
  const interview = await removeParticipant(id, participantId);
  return NextResponse.json({ interview });
}
