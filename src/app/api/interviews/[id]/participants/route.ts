import { NextResponse } from "next/server";
import { addParticipant } from "@/lib/interviews";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Params): Promise<NextResponse> {
  const { id } = await context.params;
  const interview = await addParticipant(id);
  return NextResponse.json({ interview }, { status: 201 });
}
