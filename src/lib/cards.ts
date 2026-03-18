import type { CardRating } from "@/lib/types";

export type ParsedCardEntry = {
  front: string;
  back: string;
};

export type CardImportError = {
  line: number;
  value: string;
  message: string;
};

export type CardScheduleInput = {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
};

export type CardScheduleResult = CardScheduleInput & {
  dueAt: Date;
  isCorrect: boolean;
};

export function parseCardDump(text: string) {
  const lines = text.split(/\r?\n/);
  const cards: ParsedCardEntry[] = [];
  const errors: CardImportError[] = [];
  const seen = new Set<string>();

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNo = index + 1;

    if (!line) {
      return;
    }

    const delimiterIndex = line.indexOf("—") || line.indexOf(":");
    if (delimiterIndex <= 0 || delimiterIndex === line.length - 1) {
      errors.push({
        line: lineNo,
        value: rawLine,
        message: "Рядок має бути у форматі 'питання — відповідь'.",
      });
      return;
    }

    const front = line.slice(0, delimiterIndex).trim();
    const back = line.slice(delimiterIndex + 1).trim();

    if (!front || !back) {
      errors.push({
        line: lineNo,
        value: rawLine,
        message: "Потрібно заповнити обидві частини картки.",
      });
      return;
    }

    const key = `${front.toLowerCase()}::${back.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    cards.push({ front, back });
  });

  return { cards, errors };
}

export function calculateNextCardSchedule(
  current: CardScheduleInput,
  rating: CardRating,
): CardScheduleResult {
  const now = new Date();
  let intervalDays = Math.max(1, current.intervalDays);
  let easeFactor = Math.max(1.3, current.easeFactor);
  let repetitions = Math.max(0, current.repetitions);
  let lapses = Math.max(0, current.lapses);

  if (rating === "again") {
    repetitions = 0;
    lapses += 1;
    intervalDays = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (rating === "hard") {
    repetitions += 1;
    intervalDays = Math.max(1, Math.round(intervalDays * 1.2));
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (rating === "good") {
    repetitions += 1;
    intervalDays = Math.max(
      1,
      repetitions <= 1 ? 1 : Math.round(intervalDays * easeFactor),
    );
  } else {
    repetitions += 1;
    easeFactor = Math.min(3, easeFactor + 0.15);
    intervalDays = Math.max(
      2,
      repetitions <= 1 ? 2 : Math.round(intervalDays * easeFactor * 1.35),
    );
  }

  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + intervalDays);

  return {
    intervalDays,
    easeFactor,
    repetitions,
    lapses,
    dueAt,
    isCorrect: rating !== "again",
  };
}
