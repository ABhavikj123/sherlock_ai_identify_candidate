import { Prisma } from "@prisma/client";
import { analyzeTextIntent } from "@/lib/gemini";
import { clamp01, predict, rounded, type Weights } from "@/lib/math";
import { prisma } from "@/lib/prisma";
import { safeRedisGet, safeRedisSet } from "@/lib/redis";
import type {
  CandidateScore,
  InterviewInput,
  InterviewState,
  ParticipantFeatures,
  ParticipantState,
  TrainRequest,
} from "@/lib/types";

const ACTIVE_TTL_SECONDS = 60 * 60 * 8;

const emptyFeatures: ParticipantFeatures = {
  speakingRatio: 0,
  screenShare: 0,
  webcam: 0,
  textIntent: 0.5,
};

const participantInclude = {
  participants: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.InterviewInclude;

type InterviewWithParticipants = Prisma.InterviewGetPayload<{
  include: typeof participantInclude;
}>;

export async function createInterview(input: InterviewInput): Promise<InterviewState> {
  await ensureWeights();

  const interview = await prisma.interview.create({
    data: {
      candidateName: input.candidateName.trim(),
      candidateEmail: input.candidateEmail.trim(),
      calendarInvite: input.calendarInvite.trim() || null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      interviewerNames: input.interviewerNames.filter(Boolean),
      participants: {
        createMany: {
          data: [
            blankParticipantData(),
            blankParticipantData(),
          ],
        },
      },
    },
    include: participantInclude,
  });

  const state = toInterviewState(interview);
  await cacheInterview(state);
  return state;
}

export async function getInterviewState(interviewId: string): Promise<InterviewState> {
  const cached = await safeRedisGet(cacheKey(interviewId));
  if (cached) {
    const parsed = parseInterviewState(cached);
    if (parsed) {
      return parsed;
    }
  }

  const interview = await prisma.interview.findUniqueOrThrow({
    where: { id: interviewId },
    include: participantInclude,
  });
  const state = toInterviewState(interview);
  await cacheInterview(state);
  return state;
}

export async function listCompletedInterviews(): Promise<InterviewState[]> {
  const interviews = await prisma.interview.findMany({
    where: { status: { in: ["COMPLETED", "TRAINED"] } },
    include: participantInclude,
    orderBy: { endedAt: "desc" },
  });

  return interviews.map(toInterviewState);
}

export async function addParticipant(interviewId: string): Promise<InterviewState> {
  await prisma.participant.create({
    data: {
      interviewId,
      ...blankParticipantData(),
    },
  });

  const state = await rescoreInterview(interviewId);
  await cacheInterview(state);
  return state;
}

export async function removeParticipant(interviewId: string, participantId: string): Promise<InterviewState> {
  await prisma.participant.delete({
    where: { id: participantId },
  });

  const state = await rescoreInterview(interviewId);
  await cacheInterview(state);
  return state;
}

export async function updateParticipant(
  interviewId: string,
  participant: ParticipantState,
): Promise<{ interview: InterviewState; scores: CandidateScore[] }> {
  const weights = await ensureWeights();
  const previous = await prisma.participant.findFirstOrThrow({
    where: {
      id: participant.id,
      interviewId,
    },
  });
  const transcriptChanged = previous.transcript !== participant.transcript;
  const textIntent = transcriptChanged
    ? await analyzeTextIntent(participant.transcript, weights.prompt)
    : previous.textIntent;

  await prisma.participant.update({
    where: { id: participant.id },
    data: {
      displayName: cleanOptional(participant.displayName),
      email: cleanOptional(participant.email),
      webcamOn: participant.webcamOn,
      speakerOn: participant.speakerOn,
      screenShareOn: participant.screenShareOn,
      speakingDuration: Math.max(0, participant.speakingDuration),
      transcript: participant.transcript,
      textIntent,
    },
  });

  const interview = await rescoreInterview(interviewId);
  const scores = interview.participants.map((item) => ({
    participantId: item.id,
    score: item.score,
    features: item.features,
    reasoning: item.reasoning,
  }));

  await cacheInterview(interview);
  return { interview, scores };
}

export async function stopInterview(interviewId: string): Promise<InterviewState> {
  const state = await rescoreInterview(interviewId);
  const best = [...state.participants].sort((left, right) => right.score - left.score)[0] ?? null;

  const interview = await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: "COMPLETED",
      endedAt: new Date(),
      finalPredictionId: best?.id ?? null,
    },
    include: participantInclude,
  });

  const completed = toInterviewState(interview);
  await cacheInterview(completed);
  return completed;
}

export async function trainInterview(input: TrainRequest): Promise<InterviewState> {
  const weights = await ensureWeights();
  const snapshots = await prisma.participantSnapshot.findMany({
    where: { interviewId: input.interviewId },
    orderBy: { createdAt: "desc" },
  });

  const latestByParticipant = new Map<string, ParticipantFeatures>();
  for (const snapshot of snapshots) {
    if (!latestByParticipant.has(snapshot.participantId)) {
      latestByParticipant.set(snapshot.participantId, parseFeatures(snapshot.features));
    }
  }

  let next: Weights = { ...weights };
  for (const [participantId, features] of latestByParticipant.entries()) {
    const groundTruth = participantId === input.trueCandidateId ? 1 : 0;
    const error = predict(features, next) - groundTruth;
    next = {
      ...next,
      speakingRatio: next.speakingRatio - next.learningRate * error * features.speakingRatio,
      screenShare: next.screenShare - next.learningRate * error * features.screenShare,
      webcam: next.webcam - next.learningRate * error * features.webcam,
      textIntent: next.textIntent - next.learningRate * error * features.textIntent,
      bias: next.bias - next.learningRate * error,
    };
  }

  const beforeWeights = weightsToJson(weights);
  const afterWeights = weightsToJson(next);

  await prisma.$transaction([
    prisma.modelWeights.update({
      where: { id: "global" },
      data: {
        speakingRatio: rounded(next.speakingRatio, 4),
        screenShare: rounded(next.screenShare, 4),
        webcam: rounded(next.webcam, 4),
        textIntent: rounded(next.textIntent, 4),
        bias: rounded(next.bias, 4),
      },
    }),
    prisma.interview.update({
      where: { id: input.interviewId },
      data: {
        status: "TRAINED",
        trueCandidateId: input.trueCandidateId,
        reviewNotes: input.reviewNotes.trim() || null,
      },
    }),
    prisma.participant.updateMany({
      where: { interviewId: input.interviewId },
      data: { groundTruthLabel: 0 },
    }),
    prisma.participant.update({
      where: { id: input.trueCandidateId },
      data: { groundTruthLabel: 1 },
    }),
    prisma.participantSnapshot.updateMany({
      where: { interviewId: input.interviewId },
      data: { groundTruthLabel: 0 },
    }),
    prisma.participantSnapshot.updateMany({
      where: { interviewId: input.interviewId, participantId: input.trueCandidateId },
      data: { groundTruthLabel: 1 },
    }),
    prisma.trainingRun.create({
      data: {
        interviewId: input.interviewId,
        beforeWeights,
        afterWeights,
        status: "FINISHED",
      },
    }),
  ]);

  const interview = await prisma.interview.findUniqueOrThrow({
    where: { id: input.interviewId },
    include: participantInclude,
  });
  const trained = toInterviewState(interview);
  await cacheInterview(trained);
  return trained;
}

async function rescoreInterview(interviewId: string): Promise<InterviewState> {
  const weights = await ensureWeights();
  const interview = await prisma.interview.findUniqueOrThrow({
    where: { id: interviewId },
    include: participantInclude,
  });
  const totalSpeaking = interview.participants.reduce((sum, participant) => {
    return sum + Math.max(0, participant.speakingDuration);
  }, 0);

  const updates = interview.participants.map((participant) => {
    const features: ParticipantFeatures = {
      speakingRatio: totalSpeaking > 0 ? clamp01(participant.speakingDuration / totalSpeaking) : 0,
      screenShare: participant.screenShareOn ? 1 : 0,
      webcam: participant.webcamOn ? 1 : 0,
      textIntent: clamp01(participant.textIntent),
    };
    const score = rounded(predict(features, weights));
    const reasoning = buildReasoning(features, score, participant.displayName, participant.email);

    return {
      participantId: participant.id,
      score,
      features,
      reasoning,
    };
  });

  await prisma.$transaction(
    updates.flatMap((update) => [
      prisma.participant.update({
        where: { id: update.participantId },
        data: {
          score: update.score,
          features: featuresToJson(update.features),
          reasoning: update.reasoning,
        },
      }),
      prisma.participantSnapshot.create({
        data: {
          interviewId,
          participantId: update.participantId,
          score: update.score,
          features: featuresToJson(update.features),
          reasoning: update.reasoning,
          transcript: interview.participants.find((participant) => participant.id === update.participantId)?.transcript ?? "",
        },
      }),
    ]),
  );

  const refreshed = await prisma.interview.findUniqueOrThrow({
    where: { id: interviewId },
    include: participantInclude,
  });

  return toInterviewState(refreshed);
}

async function ensureWeights(): Promise<Weights> {
  const weights = await prisma.modelWeights.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });

  return {
    speakingRatio: weights.speakingRatio,
    screenShare: weights.screenShare,
    webcam: weights.webcam,
    textIntent: weights.textIntent,
    bias: weights.bias,
    learningRate: weights.learningRate,
    prompt: weights.prompt,
  };
}

function blankParticipantData(): Prisma.ParticipantCreateManyInterviewInput {
  return {
    displayName: null,
    email: null,
    features: featuresToJson(emptyFeatures),
    reasoning: ["Waiting for live signals."],
  };
}

function buildReasoning(
  features: ParticipantFeatures,
  score: number,
  displayName: string | null,
  email: string | null,
): string[] {
  const reasons: string[] = [];
  if (features.textIntent >= 0.65) {
    reasons.push("Transcript sounds more like answering than interviewing.");
  } else if (features.textIntent <= 0.35) {
    reasons.push("Transcript sounds more like asking than answering.");
  } else {
    reasons.push("Transcript is still ambiguous.");
  }

  if (features.speakingRatio >= 0.45) {
    reasons.push("Speaking share is high compared with the room.");
  } else if (features.speakingRatio <= 0.1) {
    reasons.push("Speaking share is still low.");
  } else {
    reasons.push("Speaking share gives a moderate signal.");
  }

  if (!displayName && !email) {
    reasons.push("Identity fields are missing, so confidence stays cautious.");
  } else if (score >= 0.75) {
    reasons.push("Multiple weak signals currently point to this participant.");
  } else if (score >= 0.45) {
    reasons.push("Signals are mixed, so this remains a maybe.");
  } else {
    reasons.push("Current signals do not strongly match the candidate pattern.");
  }

  return reasons.slice(0, 3);
}

function toInterviewState(interview: InterviewWithParticipants): InterviewState {
  return {
    id: interview.id,
    candidateName: interview.candidateName,
    candidateEmail: interview.candidateEmail,
    calendarInvite: interview.calendarInvite,
    scheduledAt: interview.scheduledAt?.toISOString() ?? null,
    interviewerNames: parseStringArray(interview.interviewerNames),
    status: interview.status,
    finalPredictionId: interview.finalPredictionId,
    trueCandidateId: interview.trueCandidateId,
    reviewNotes: interview.reviewNotes,
    createdAt: interview.createdAt.toISOString(),
    startedAt: interview.startedAt.toISOString(),
    endedAt: interview.endedAt?.toISOString() ?? null,
    participants: interview.participants.map((participant) => ({
      id: participant.id,
      displayName: participant.displayName ?? "",
      email: participant.email ?? "",
      webcamOn: participant.webcamOn,
      speakerOn: participant.speakerOn,
      screenShareOn: participant.screenShareOn,
      speakingDuration: participant.speakingDuration,
      transcript: participant.transcript,
      textIntent: participant.textIntent,
      score: participant.score,
      features: parseFeatures(participant.features),
      reasoning: parseStringArray(participant.reasoning),
    })),
  };
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function parseFeatures(value: Prisma.JsonValue): ParticipantFeatures {
  if (!isRecord(value)) {
    return emptyFeatures;
  }

  return {
    speakingRatio: numberFromRecord(value, "speakingRatio", 0),
    screenShare: numberFromRecord(value, "screenShare", 0),
    webcam: numberFromRecord(value, "webcam", 0),
    textIntent: numberFromRecord(value, "textIntent", 0.5),
  };
}

function parseInterviewState(value: string): InterviewState | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || typeof parsed.id !== "string" || !Array.isArray(parsed.participants)) {
      return null;
    }

    return parsed as InterviewState;
  } catch {
    return null;
  }
}

function numberFromRecord(record: Record<string, unknown>, key: keyof ParticipantFeatures, fallback: number): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function featuresToJson(features: ParticipantFeatures): Prisma.InputJsonObject {
  return {
    speakingRatio: rounded(features.speakingRatio),
    screenShare: rounded(features.screenShare),
    webcam: rounded(features.webcam),
    textIntent: rounded(features.textIntent),
  };
}

function weightsToJson(weights: Weights): Prisma.InputJsonObject {
  return {
    speakingRatio: rounded(weights.speakingRatio, 4),
    screenShare: rounded(weights.screenShare, 4),
    webcam: rounded(weights.webcam, 4),
    textIntent: rounded(weights.textIntent, 4),
    bias: rounded(weights.bias, 4),
    learningRate: rounded(weights.learningRate, 4),
  };
}

async function cacheInterview(state: InterviewState): Promise<void> {
  await safeRedisSet(cacheKey(state.id), JSON.stringify(state), ACTIVE_TTL_SECONDS);
}

function cacheKey(interviewId: string): string {
  return `interview:${interviewId}`;
}
