export type ProgressSummary = {
  attemptsCount: number;
  correctCount: number;
  incorrectCount: number;
  lastResult: boolean | null;
  lastAnsweredAt: string | null;
};

export type StressWord = {
  id: number;
  sourceText: string;
  displayWord: string;
  stressPositions: number[];
  createdAt: string;
  updatedAt: string;
  progress: ProgressSummary;
};

export type SessionAttempt = {
  itemId: number;
  prompt: string;
  answer: string;
  chosen: string;
  isCorrect: boolean;
};

export type StressSessionAttempt = {
  wordId: number;
  word: string;
  sourceText: string;
  chosenIndex: number;
  correctPositions: number[];
  isCorrect: boolean;
};

export type CardRating = "again" | "hard" | "good" | "easy";

export type CardDeck = {
  id: number;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cardCount: number;
  dueCount: number;
};

export type Card = {
  id: number;
  userId: string;
  deckId: number;
  front: string;
  back: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  progress: ProgressSummary;
};

export type CardReviewAttempt = {
  cardId: number;
  front: string;
  back: string;
  rating: CardRating;
  isCorrect: boolean;
};

export type HistoryDate = {
  id: number;
  ordinal: number;
  dateText: string;
  eventText: string;
  isStrong: boolean;
  progress: ProgressSummary;
};

export type DateAttemptPayload = {
  dateId: number;
  isCorrect: boolean;
  associationIds?: number[];
};

export type DateStatsSummary = {
  totalDates: number;
  studiedCount: number;
  overallAccuracy: number;
  strongAccuracy: number;
  nonStrongAccuracy: number;
  strongStudied: number;
  nonStrongStudied: number;
};

export type DateDailyTrend = {
  date: string;
  attempts: number;
  correct: number;
};

export type DatePerDateStat = {
  id: number;
  ordinal: number;
  dateText: string;
  eventText: string;
  isStrong: boolean;
  attemptsCount: number;
  correctCount: number;
  accuracy: number;
  lastAnsweredAt: string | null;
  lastResult: boolean | null;
};

export type TestSession = {
  id: number;
  userId: string;
  sphere: "stress" | "cards" | "dates";
  title: string;
  mode: string | null;
  total: number;
  correct: number;
  incorrect: number;
  startedAt: string;
  finishedAt: string;
  attempts: SessionAttempt[];
};
