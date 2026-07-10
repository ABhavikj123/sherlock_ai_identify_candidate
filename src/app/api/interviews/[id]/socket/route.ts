import { experimental_upgradeWebSocket, type WebSocket, type WebSocketData } from "@vercel/functions";
import {
  addParticipant,
  getInterviewState,
  removeParticipant,
  stopInterview,
  updateParticipant,
} from "@/lib/interviews";
import type { LiveClientMessage, LiveServerMessage } from "@/lib/types";

type Params = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";
export const maxDuration = 300;

const OPEN_SOCKET_STATE = 1;

export async function GET(_request: Request, context: Params): Promise<Response> {
  const { id } = await context.params;

  return experimental_upgradeWebSocket(async (socket: WebSocket) => {
    const connectionId = crypto.randomUUID();
    await send(socket, {
      type: "state",
      interview: await getInterviewState(id),
      connectionId,
    });

    socket.on("message", async (raw: WebSocketData) => {
      const message = parseMessage(raw);
      if (!message || message.interviewId !== id) {
        await send(socket, { type: "error", message: "Invalid live message." });
        return;
      }

      try {
        if (message.type === "sync") {
          await send(socket, {
            type: "state",
            interview: await getInterviewState(id),
            connectionId,
          });
        }

        if (message.type === "participant:add") {
          await send(socket, {
            type: "state",
            interview: await addParticipant(id),
            connectionId,
          });
        }

        if (message.type === "participant:remove") {
          await send(socket, {
            type: "state",
            interview: await removeParticipant(id, message.participantId),
            connectionId,
          });
        }

        if (message.type === "participant:update") {
          const result = await updateParticipant(id, message.participant);
          await send(socket, {
            type: "scores",
            interview: result.interview,
            scores: result.scores,
          });
        }

        if (message.type === "interview:stop") {
          await send(socket, {
            type: "stopped",
            interview: await stopInterview(id),
          });
          socket.close(1000, "Interview stopped.");
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "Live update failed.";
        await send(socket, { type: "error", message: messageText });
      }
    });
  });
}

async function send(socket: WebSocket, message: LiveServerMessage): Promise<void> {
  if (socket.readyState === OPEN_SOCKET_STATE) {
    socket.send(JSON.stringify(message));
  }
}

function parseMessage(raw: WebSocketData): LiveClientMessage | null {
  try {
    const text = rawDataToText(raw);
    const parsed = JSON.parse(text) as unknown;
    return isLiveClientMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function rawDataToText(raw: WebSocketData): string {
  if (typeof raw === "string") {
    return raw;
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }

  return raw.toString("utf8");
}

function isLiveClientMessage(value: unknown): value is LiveClientMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || typeof record.interviewId !== "string") {
    return false;
  }

  if (record.type === "participant:remove") {
    return typeof record.participantId === "string";
  }

  if (record.type === "participant:update") {
    return typeof record.participant === "object" && record.participant !== null;
  }

  return ["sync", "participant:add", "interview:stop"].includes(record.type);
}
