import { neon } from "@neondatabase/serverless";

import {
  deserializeStressPositions,
  parseStressWord,
  serializeStressPositions,
  splitImportedWords,
} from "@/lib/stress";
import type { ProgressSummary, StressWord } from "@/lib/types";

type WordRow = {
  id: number;
  source_text: string;
  display_word: string;
  stress_positions: string;
  created_at: string;
  updated_at: string;
  attempts_count: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
  last_result: boolean | null;
  last_answered_at: string | null;
};

type ProgressRow = {
  attempts_count: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
  last_result: boolean | null;
  last_answered_at: string | null;
};

let schemaPromise: Promise<void> | null = null;

function getSql() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Змінна DATABASE_URL не налаштована. Додайте підключення до Neon."
    );
  }

  return neon(connectionString);
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();

      await sql`
        CREATE TABLE IF NOT EXISTS stress_words (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          source_text TEXT NOT NULL,
          display_word TEXT NOT NULL,
          stress_positions JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT stress_words_user_display_unique UNIQUE (user_id, display_word)
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS stress_words_user_id_idx
        ON stress_words (user_id)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS word_progress (
          word_id INTEGER PRIMARY KEY REFERENCES stress_words(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          attempts_count INTEGER NOT NULL DEFAULT 0,
          correct_count INTEGER NOT NULL DEFAULT 0,
          incorrect_count INTEGER NOT NULL DEFAULT 0,
          last_result BOOLEAN,
          last_answered_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS word_progress_user_id_idx
        ON word_progress (user_id, last_answered_at)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS word_attempts (
          id BIGSERIAL PRIMARY KEY,
          word_id INTEGER NOT NULL REFERENCES stress_words(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          is_correct BOOLEAN NOT NULL,
          chosen_index INTEGER NOT NULL,
          answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS word_attempts_user_answered_at_idx
        ON word_attempts (user_id, answered_at DESC)
      `;
    })();
  }

  return schemaPromise;
}

function mapProgress(row: ProgressRow): ProgressSummary {
  return {
    attemptsCount: row.attempts_count ?? 0,
    correctCount: row.correct_count ?? 0,
    incorrectCount: row.incorrect_count ?? 0,
    lastResult: row.last_result,
    lastAnsweredAt: row.last_answered_at,
  };
}

function mapWord(row: WordRow): StressWord {
  return {
    id: row.id,
    sourceText: row.source_text,
    displayWord: row.display_word,
    stressPositions: deserializeStressPositions(row.stress_positions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress: mapProgress(row),
  };
}

async function getWordById(id: number, userId: string): Promise<StressWord | null> {
  const sql = getSql();

  const rows = (await sql`
    SELECT
      words.id,
      words.source_text,
      words.display_word,
      words.stress_positions::text AS stress_positions,
      words.created_at::text AS created_at,
      words.updated_at::text AS updated_at,
      progress.attempts_count,
      progress.correct_count,
      progress.incorrect_count,
      progress.last_result,
      progress.last_answered_at::text AS last_answered_at
    FROM stress_words AS words
    LEFT JOIN word_progress AS progress
      ON progress.word_id = words.id
    WHERE words.id = ${id} AND words.user_id = ${userId}
  `) as WordRow[];

  return rows[0] ? mapWord(rows[0]) : null;
}

export async function listWordsForUser(userId: string): Promise<StressWord[]> {
  await ensureSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT
      words.id,
      words.source_text,
      words.display_word,
      words.stress_positions::text AS stress_positions,
      words.created_at::text AS created_at,
      words.updated_at::text AS updated_at,
      progress.attempts_count,
      progress.correct_count,
      progress.incorrect_count,
      progress.last_result,
      progress.last_answered_at::text AS last_answered_at
    FROM stress_words AS words
    LEFT JOIN word_progress AS progress
      ON progress.word_id = words.id
    WHERE words.user_id = ${userId}
    ORDER BY words.display_word ASC
  `) as WordRow[];

  return rows.map(mapWord);
}

export async function upsertWordForUser(
  userId: string,
  wordInput: string,
): Promise<StressWord> {
  await ensureSchema();
  const sql = getSql();
  const parsedWord = parseStressWord(wordInput);

  const upsertedRows = (await sql`
    INSERT INTO stress_words (
      user_id,
      source_text,
      display_word,
      stress_positions,
      updated_at
    )
    VALUES (
      ${userId},
      ${parsedWord.sourceText},
      ${parsedWord.displayWord},
      ${serializeStressPositions(parsedWord.stressPositions)}::jsonb,
      NOW()
    )
    ON CONFLICT (user_id, display_word)
    DO UPDATE SET
      source_text = EXCLUDED.source_text,
      stress_positions = EXCLUDED.stress_positions,
      updated_at = NOW()
    RETURNING id
  `) as { id: number }[];

  const word = await getWordById(upsertedRows[0].id, userId);

  if (!word) {
    throw new Error("Не вдалося зберегти слово.");
  }

  return word;
}

export async function importWordsForUser(userId: string, rawText: string) {
  await ensureSchema();
  const entries = splitImportedWords(rawText);

  if (entries.length === 0) {
    throw new Error("Додайте хоча б одне слово для імпорту.");
  }

  const deduplicatedEntries = [...new Set(entries)];
  const savedWords: StressWord[] = [];
  const errors: { value: string; message: string }[] = [];

  for (const entry of deduplicatedEntries) {
    try {
      const savedWord = await upsertWordForUser(userId, entry);
      savedWords.push(savedWord);
    } catch (error) {
      errors.push({
        value: entry,
        message:
          error instanceof Error ? error.message : "Не вдалося обробити слово.",
      });
    }
  }

  return {
    savedWords,
    errors,
  };
}

export async function deleteWordForUser(userId: string, wordId: number) {
  await ensureSchema();
  const sql = getSql();

  const deletedRows = (await sql`
    DELETE FROM stress_words
    WHERE id = ${wordId} AND user_id = ${userId}
    RETURNING id
  `) as { id: number }[];

  return deletedRows.length > 0;
}

export async function updateWordForUser(
  userId: string,
  wordId: number,
  wordInput: string,
): Promise<StressWord> {
  await ensureSchema();
  const sql = getSql();
  const parsedWord = parseStressWord(wordInput);

  const conflictingRows = (await sql`
    SELECT id
    FROM stress_words
    WHERE user_id = ${userId}
      AND display_word = ${parsedWord.displayWord}
      AND id <> ${wordId}
    LIMIT 1
  `) as { id: number }[];

  if (conflictingRows.length > 0) {
    throw new Error("Слово з таким написанням уже існує у вашому списку.");
  }

  const updatedRows = (await sql`
    UPDATE stress_words
    SET
      source_text = ${parsedWord.sourceText},
      display_word = ${parsedWord.displayWord},
      stress_positions = ${serializeStressPositions(parsedWord.stressPositions)}::jsonb,
      updated_at = NOW()
    WHERE id = ${wordId} AND user_id = ${userId}
    RETURNING id
  `) as { id: number }[];

  if (updatedRows.length === 0) {
    throw new Error("Слово не знайдено.");
  }

  const word = await getWordById(updatedRows[0].id, userId);

  if (!word) {
    throw new Error("Не вдалося оновити слово.");
  }

  return word;
}

export async function recordAttemptForWord({
  userId,
  wordId,
  chosenIndex,
  isCorrect,
}: {
  userId: string;
  wordId: number;
  chosenIndex: number;
  isCorrect: boolean;
}) {
  await ensureSchema();
  const sql = getSql();

  const word = await getWordById(wordId, userId);

  if (!word) {
    throw new Error("Слово не знайдено.");
  }

  await sql`
    INSERT INTO word_attempts (word_id, user_id, is_correct, chosen_index)
    VALUES (${wordId}, ${userId}, ${isCorrect}, ${chosenIndex})
  `;

  await sql`
    INSERT INTO word_progress (
      word_id,
      user_id,
      attempts_count,
      correct_count,
      incorrect_count,
      last_result,
      last_answered_at,
      updated_at
    )
    VALUES (
      ${wordId},
      ${userId},
      1,
      ${isCorrect ? 1 : 0},
      ${isCorrect ? 0 : 1},
      ${isCorrect},
      NOW(),
      NOW()
    )
    ON CONFLICT (word_id)
    DO UPDATE SET
      attempts_count = word_progress.attempts_count + 1,
      correct_count = word_progress.correct_count + ${isCorrect ? 1 : 0},
      incorrect_count = word_progress.incorrect_count + ${isCorrect ? 0 : 1},
      last_result = ${isCorrect},
      last_answered_at = NOW(),
      updated_at = NOW()
  `;

  const refreshedWord = await getWordById(wordId, userId);

  if (!refreshedWord) {
    throw new Error("Не вдалося оновити прогрес слова.");
  }

  return refreshedWord;
}
