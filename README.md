# Sherlock Candidate ID

A Next.js prototype that identifies the interview candidate during a live meeting using multiple weak signals: speaking share, webcam state, screen share state, and transcript intent.

The app lets an interviewer create an interview, add live participants, update participant signals, see candidate confidence per participant, stop the interview, review the result, and train the scoring weights from the reviewed ground truth.

## Architecture

```text
Browser UI
  |
  | create interview / participant updates / stop / train
  v
Next.js App Router API
  |
  |-- Live interview routes
  |     - create interview
  |     - update participant signals
  |     - rescore participants
  |     - stop interview
  |
  |-- Training route
        - accept reviewed true candidate
        - update model weights

Core services
  |
  |-- Gemini 2.5 Flash
  |     - transcript intent scoring
  |
  |-- Redis
  |     - active interview cache and recovery
  |
  |-- PostgreSQL / Neon via Prisma
        - interviews
        - participants
        - participant snapshots
        - model weights
        - training runs
```

## Approach

The system does not rely on one rule such as name matching. Each participant is scored from normalized features:

- `F1`: speaking ratio, calculated as participant speaking duration divided by total room speaking duration.
- `F2`: screen share state, `1.0` when active and `0.0` otherwise.
- `F3`: webcam state, `1.0` when active and `0.0` otherwise.
- `F4`: transcript intent, scored by Gemini as the probability that the text is an answer rather than an interviewer question.

The backend loads current global model weights from the database and calculates:

```text
Z = (F1 * W1) + (F2 * W2) + (F3 * W3) + (F4 * W4) + Bias
confidence = sigmoid(Z)
```

Each participant gets a confidence percentage and short reasoning bullets. After the interview, the reviewer selects the real candidate from history. The training route updates the global weights with a simple gradient descent step so future interviews can improve.

## Evaluation

I tested the prototype through the main workflow:

- Create an interview with candidate metadata.
- Add and update multiple participants.
- Save participant name, email, transcript, speaking time, webcam, speaking, and screen-share signals.
- Confirm participant cards keep stable identity and do not swap values.
- Confirm confidence updates after signals are saved.
- Stop an interview and verify it appears in history.
- Select the real candidate and run training.
- Run static checks with `npm run lint`.
- Run production build with `npm run build`.

## Edge Cases

Handled cases:

- Missing participant name or email.
- Incorrect display names.
- Ambiguous transcript text.
- Multiple participants with similar signals.
- No speaking duration yet.
- Reload during an active interview using local storage plus Redis/database recovery.
- Completed interviews are kept out of the live view and shown in history.

## Accuracy

This is a prototype, so accuracy is not claimed as production-grade. It should behave reasonably when transcript intent, speaking ratio, and activity signals differ between interviewer and candidate. The model improves only after reviewed interviews are trained.

The scoring is intentionally cautious: ambiguous or missing data keeps participants closer together instead of forcing a confident guess.

## Limitations

- The prototype uses manually entered participant signals instead of real meeting SDK streams.
- Transcript intent depends on Gemini response quality.
- The training loop is simple online logistic-style optimization, not a full ML pipeline.
- It does not use face recognition, voice identity, or calendar attendee matching beyond stored metadata.
- Real WebSocket behavior can differ by hosting/runtime, so the main live flow uses API saves for predictable prototype behavior.
- No authentication or role-based access is included.

## Assumptions

- The system receives speaker-attributed transcript text per participant.
- Speaking duration is available per participant.
- Webcam, speaking, and screen-share states are available as participant events.
- Candidate metadata is known before the interview starts.
- A human reviewer can confirm the true candidate after the interview.
- Neon/PostgreSQL, Redis, and Gemini API credentials are available in environment variables.

## Trade-offs

- I used a small weighted scoring model instead of a complex ML model so the system is explainable and easy to inspect.
- I kept the UI event model explicit with save buttons to avoid noisy updates and stale state bugs.
- I used Prisma for database access because it keeps the schema clear and reduces boilerplate.
- I used Redis as a recovery cache, but PostgreSQL remains the durable source of truth.
- I prioritized a working end-to-end prototype over production concerns like auth, observability, and advanced model evaluation.

## What I Would Improve Next

- Connect to a real meeting SDK for actual audio, video, screen-share, and participant events.
- Add automatic transcript ingestion instead of manual transcript entry.
- Add a stronger evaluation set with labeled interview sessions.
- Track model versions and compare weight changes over time.
- Add confidence calibration and threshold-based uncertainty states.
- Add authentication for interviewers and reviewers.
- Improve explanations with richer per-feature contribution details.

## Tech Stack

- Next.js
- React
- TypeScript
- Prisma
- PostgreSQL / Neon
- Redis
- Gemini API
- Tailwind CSS

## Setup

Install dependencies:

```bash
npm install
```

Create environment variables:

```bash
DATABASE_URL=
REDIS_URL=
GEMINI_API_KEY=
```

Push the Prisma schema:

```bash
npm exec prisma db push
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```
