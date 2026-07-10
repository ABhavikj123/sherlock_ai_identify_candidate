import type { ParticipantFeatures } from "@/lib/types";

export type Weights = {
  speakingRatio: number;
  screenShare: number;
  webcam: number;
  textIntent: number;
  bias: number;
  learningRate: number;
  prompt: string;
};

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export function predict(features: ParticipantFeatures, weights: Weights): number {
  const z =
    features.speakingRatio * weights.speakingRatio +
    features.screenShare * weights.screenShare +
    features.webcam * weights.webcam +
    features.textIntent * weights.textIntent +
    weights.bias;

  return clamp01(sigmoid(z));
}

export function rounded(value: number, precision = 3): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}
