export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

export type InterviewStatus = "ACTIVE" | "COMPLETED" | "TRAINED";

export type ParticipantFeatures = {
  speakingRatio: number;
  screenShare: number;
  webcam: number;
  textIntent: number;
};

export type CandidateScore = {
  participantId: string;
  score: number;
  features: ParticipantFeatures;
  reasoning: string[];
};

export type ParticipantState = {
  id: string;
  displayName: string;
  email: string;
  webcamOn: boolean;
  speakerOn: boolean;
  screenShareOn: boolean;
  speakingDuration: number;
  transcript: string;
  textIntent: number;
  score: number;
  features: ParticipantFeatures;
  reasoning: string[];
};

export type InterviewInput = {
  candidateName: string;
  candidateEmail: string;
  calendarInvite: string;
  scheduledAt: string;
  interviewerNames: string[];
};

export type InterviewState = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  calendarInvite: string | null;
  scheduledAt: string | null;
  interviewerNames: string[];
  status: InterviewStatus;
  finalPredictionId: string | null;
  trueCandidateId: string | null;
  reviewNotes: string | null;
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  participants: ParticipantState[];
};

export type LiveClientMessage =
  | { type: "sync"; interviewId: string }
  | { type: "participant:update"; interviewId: string; participant: ParticipantState }
  | { type: "participant:add"; interviewId: string }
  | { type: "participant:remove"; interviewId: string; participantId: string }
  | { type: "interview:stop"; interviewId: string };

export type LiveServerMessage =
  | { type: "state"; interview: InterviewState; connectionId: string }
  | { type: "scores"; interview: InterviewState; scores: CandidateScore[] }
  | { type: "stopped"; interview: InterviewState }
  | { type: "error"; message: string };

export type TrainRequest = {
  interviewId: string;
  trueCandidateId: string;
  reviewNotes: string;
};
