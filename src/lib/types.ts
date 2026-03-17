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
  wordId: number;
  word: string;
  sourceText: string;
  chosenIndex: number;
  correctPositions: number[];
  isCorrect: boolean;
};
