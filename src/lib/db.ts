import { neon } from "@neondatabase/serverless";

import { calculateNextCardSchedule, parseCardDump } from "@/lib/cards";
import {
  deserializeStressPositions,
  parseStressWord,
  serializeStressPositions,
  splitImportedWords,
} from "@/lib/stress";
import type {
  Card,
  CardDeck,
  CardRating,
  ProgressSummary,
  SessionAttempt,
  StressWord,
  TestSession,
} from "@/lib/types";

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

type DeckRow = {
  id: number;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  card_count: number | null;
  due_count: number | null;
};

type CardRow = {
  id: number;
  user_id: string;
  deck_id: number;
  front: string;
  back: string;
  created_at: string;
  updated_at: string;
  due_at: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  lapses: number;
  attempts_count: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
  last_result: boolean | null;
  last_answered_at: string | null;
};

type SessionRow = {
  id: number;
  user_id: string;
  sphere: "stress" | "cards";
  title: string;
  mode: string | null;
  total: number;
  correct: number;
  incorrect: number;
  started_at: string;
  finished_at: string;
  attempts_json: string;
};

let schemaPromise: Promise<void> | null = null;

function getSql() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Змінна DATABASE_URL не налаштована. Додайте підключення до Neon.",
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

      await sql`
        CREATE TABLE IF NOT EXISTS card_decks (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT card_decks_user_name_unique UNIQUE (user_id, name)
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS card_decks_user_id_idx
        ON card_decks (user_id, updated_at DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS cards (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          deck_id INTEGER NOT NULL REFERENCES card_decks(id) ON DELETE CASCADE,
          front TEXT NOT NULL,
          back TEXT NOT NULL,
          due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          interval_days INTEGER NOT NULL DEFAULT 1,
          ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5,
          repetitions INTEGER NOT NULL DEFAULT 0,
          lapses INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT cards_user_deck_front_back_unique UNIQUE (user_id, deck_id, front, back)
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS cards_user_deck_due_idx
        ON cards (user_id, deck_id, due_at)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS card_progress (
          card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
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
        CREATE INDEX IF NOT EXISTS card_progress_user_id_idx
        ON card_progress (user_id, last_answered_at)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS card_attempts (
          id BIGSERIAL PRIMARY KEY,
          card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          rating TEXT NOT NULL,
          is_correct BOOLEAN NOT NULL,
          answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS card_attempts_user_answered_at_idx
        ON card_attempts (user_id, answered_at DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS test_sessions (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          sphere TEXT NOT NULL,
          title TEXT NOT NULL,
          mode TEXT,
          total INTEGER NOT NULL,
          correct INTEGER NOT NULL,
          incorrect INTEGER NOT NULL,
          started_at TIMESTAMPTZ NOT NULL,
          finished_at TIMESTAMPTZ NOT NULL,
          attempts_json JSONB NOT NULL DEFAULT '[]'::jsonb
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS test_sessions_user_sphere_finished_idx
        ON test_sessions (user_id, sphere, finished_at DESC)
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

function mapDeck(row: DeckRow): CardDeck {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cardCount: row.card_count ?? 0,
    dueCount: row.due_count ?? 0,
  };
}

function mapCard(row: CardRow): Card {
  return {
    id: row.id,
    userId: row.user_id,
    deckId: row.deck_id,
    front: row.front,
    back: row.back,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dueAt: row.due_at,
    intervalDays: row.interval_days,
    easeFactor: row.ease_factor,
    repetitions: row.repetitions,
    lapses: row.lapses,
    progress: mapProgress(row),
  };
}

function mapSession(row: SessionRow): TestSession {
  return {
    id: row.id,
    userId: row.user_id,
    sphere: row.sphere,
    title: row.title,
    mode: row.mode,
    total: row.total,
    correct: row.correct,
    incorrect: row.incorrect,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    attempts: JSON.parse(row.attempts_json) as SessionAttempt[],
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

async function getCardById(id: number, userId: string): Promise<Card | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      cards.id,
      cards.user_id,
      cards.deck_id,
      cards.front,
      cards.back,
      cards.created_at::text AS created_at,
      cards.updated_at::text AS updated_at,
      cards.due_at::text AS due_at,
      cards.interval_days,
      cards.ease_factor,
      cards.repetitions,
      cards.lapses,
      progress.attempts_count,
      progress.correct_count,
      progress.incorrect_count,
      progress.last_result,
      progress.last_answered_at::text AS last_answered_at
    FROM cards
    LEFT JOIN card_progress AS progress
      ON progress.card_id = cards.id
    WHERE cards.id = ${id} AND cards.user_id = ${userId}
  `) as CardRow[];

  return rows[0] ? mapCard(rows[0]) : null;
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

export async function listDecksForUser(userId: string): Promise<CardDeck[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      decks.id,
      decks.user_id,
      decks.name,
      decks.created_at::text AS created_at,
      decks.updated_at::text AS updated_at,
      COALESCE(cards_stats.card_count, 0)::integer AS card_count,
      COALESCE(cards_stats.due_count, 0)::integer AS due_count
    FROM card_decks AS decks
    LEFT JOIN (
      SELECT
        deck_id,
        COUNT(*)::integer AS card_count,
        COUNT(*) FILTER (WHERE due_at <= NOW())::integer AS due_count
      FROM cards
      WHERE user_id = ${userId}
      GROUP BY deck_id
    ) AS cards_stats
      ON cards_stats.deck_id = decks.id
    WHERE decks.user_id = ${userId}
    ORDER BY decks.updated_at DESC
  `) as DeckRow[];

  return rows.map(mapDeck);
}

export async function createDeckForUser(userId: string, name: string): Promise<CardDeck> {
  await ensureSchema();
  const sql = getSql();
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Назва колоди не може бути порожньою.");
  }

  const rows = (await sql`
    INSERT INTO card_decks (user_id, name, updated_at)
    VALUES (${userId}, ${trimmedName}, NOW())
    ON CONFLICT (user_id, name)
    DO UPDATE SET updated_at = NOW()
    RETURNING id
  `) as { id: number }[];

  const decks = await listDecksForUser(userId);
  const deck = decks.find((item) => item.id === rows[0].id);
  if (!deck) {
    throw new Error("Не вдалося зберегти колоду.");
  }

  return deck;
}

export async function updateDeckForUser(
  userId: string,
  deckId: number,
  name: string,
): Promise<CardDeck> {
  await ensureSchema();
  const sql = getSql();
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Назва колоди не може бути порожньою.");
  }

  const rows = (await sql`
    UPDATE card_decks
    SET name = ${trimmedName}, updated_at = NOW()
    WHERE id = ${deckId} AND user_id = ${userId}
    RETURNING id
  `) as { id: number }[];

  if (rows.length === 0) {
    throw new Error("Колоду не знайдено.");
  }

  const decks = await listDecksForUser(userId);
  const deck = decks.find((item) => item.id === deckId);
  if (!deck) {
    throw new Error("Не вдалося оновити колоду.");
  }

  return deck;
}

export async function deleteDeckForUser(userId: string, deckId: number) {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM card_decks
    WHERE id = ${deckId} AND user_id = ${userId}
    RETURNING id
  `) as { id: number }[];

  return rows.length > 0;
}

export async function listCardsForDeckForUser(
  userId: string,
  deckId: number,
): Promise<Card[]> {
  await ensureSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT
      cards.id,
      cards.user_id,
      cards.deck_id,
      cards.front,
      cards.back,
      cards.created_at::text AS created_at,
      cards.updated_at::text AS updated_at,
      cards.due_at::text AS due_at,
      cards.interval_days,
      cards.ease_factor,
      cards.repetitions,
      cards.lapses,
      progress.attempts_count,
      progress.correct_count,
      progress.incorrect_count,
      progress.last_result,
      progress.last_answered_at::text AS last_answered_at
    FROM cards
    LEFT JOIN card_progress AS progress
      ON progress.card_id = cards.id
    WHERE cards.user_id = ${userId} AND cards.deck_id = ${deckId}
    ORDER BY cards.updated_at DESC
  `) as CardRow[];

  return rows.map(mapCard);
}

export async function createCardForUser({
  userId,
  deckId,
  front,
  back,
}: {
  userId: string;
  deckId: number;
  front: string;
  back: string;
}) {
  await ensureSchema();
  const sql = getSql();
  const normalizedFront = front.trim();
  const normalizedBack = back.trim();

  if (!normalizedFront || !normalizedBack) {
    throw new Error("Потрібно заповнити лицьову і зворотну частини картки.");
  }

  const rows = (await sql`
    INSERT INTO cards (
      user_id,
      deck_id,
      front,
      back,
      due_at,
      interval_days,
      ease_factor,
      repetitions,
      lapses,
      updated_at
    )
    VALUES (
      ${userId},
      ${deckId},
      ${normalizedFront},
      ${normalizedBack},
      NOW(),
      1,
      2.5,
      0,
      0,
      NOW()
    )
    ON CONFLICT (user_id, deck_id, front, back)
    DO UPDATE SET updated_at = NOW()
    RETURNING id
  `) as { id: number }[];

  const card = await getCardById(rows[0].id, userId);
  if (!card) {
    throw new Error("Не вдалося зберегти картку.");
  }

  return card;
}

export async function updateCardForUser({
  userId,
  cardId,
  front,
  back,
}: {
  userId: string;
  cardId: number;
  front: string;
  back: string;
}) {
  await ensureSchema();
  const sql = getSql();
  const normalizedFront = front.trim();
  const normalizedBack = back.trim();

  if (!normalizedFront || !normalizedBack) {
    throw new Error("Потрібно заповнити лицьову і зворотну частини картки.");
  }

  const rows = (await sql`
    UPDATE cards
    SET
      front = ${normalizedFront},
      back = ${normalizedBack},
      updated_at = NOW()
    WHERE id = ${cardId} AND user_id = ${userId}
    RETURNING id
  `) as { id: number }[];

  if (rows.length === 0) {
    throw new Error("Картку не знайдено.");
  }

  const card = await getCardById(cardId, userId);
  if (!card) {
    throw new Error("Не вдалося оновити картку.");
  }

  return card;
}

export async function deleteCardForUser(userId: string, cardId: number) {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM cards
    WHERE id = ${cardId} AND user_id = ${userId}
    RETURNING id
  `) as { id: number }[];

  return rows.length > 0;
}

export async function importCardsForUser({
  userId,
  deckId,
  text,
}: {
  userId: string;
  deckId: number;
  text: string;
}) {
  await ensureSchema();
  const parsed = parseCardDump(text);
  if (parsed.cards.length === 0) {
    throw new Error("Не знайдено жодної валідної картки для імпорту.");
  }

  const savedCards: Card[] = [];
  const errors = parsed.errors.map((item) => ({
    value: `рядок ${item.line}`,
    message: `${item.message} (${item.value})`,
  }));

  for (const entry of parsed.cards) {
    try {
      const card = await createCardForUser({
        userId,
        deckId,
        front: entry.front,
        back: entry.back,
      });
      savedCards.push(card);
    } catch (error) {
      errors.push({
        value: `${entry.front} - ${entry.back}`,
        message: error instanceof Error ? error.message : "Не вдалося імпортувати картку.",
      });
    }
  }

  return { savedCards, errors };
}

export async function listDueCardsForDeckForUser(
  userId: string,
  deckId: number,
  dueOnly = true,
): Promise<Card[]> {
  await ensureSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT
      cards.id,
      cards.user_id,
      cards.deck_id,
      cards.front,
      cards.back,
      cards.created_at::text AS created_at,
      cards.updated_at::text AS updated_at,
      cards.due_at::text AS due_at,
      cards.interval_days,
      cards.ease_factor,
      cards.repetitions,
      cards.lapses,
      progress.attempts_count,
      progress.correct_count,
      progress.incorrect_count,
      progress.last_result,
      progress.last_answered_at::text AS last_answered_at
    FROM cards
    LEFT JOIN card_progress AS progress
      ON progress.card_id = cards.id
    WHERE cards.user_id = ${userId}
      AND cards.deck_id = ${deckId}
      AND (${dueOnly} = FALSE OR cards.due_at <= NOW())
    ORDER BY cards.due_at ASC, cards.updated_at ASC
  `) as CardRow[];

  return rows.map(mapCard);
}

export async function recordCardReviewForUser({
  userId,
  cardId,
  rating,
}: {
  userId: string;
  cardId: number;
  rating: CardRating;
}) {
  await ensureSchema();
  const sql = getSql();
  const card = await getCardById(cardId, userId);

  if (!card) {
    throw new Error("Картку не знайдено.");
  }

  const nextSchedule = calculateNextCardSchedule(
    {
      intervalDays: card.intervalDays,
      easeFactor: card.easeFactor,
      repetitions: card.repetitions,
      lapses: card.lapses,
    },
    rating,
  );

  await sql`
    INSERT INTO card_attempts (card_id, user_id, rating, is_correct)
    VALUES (${cardId}, ${userId}, ${rating}, ${nextSchedule.isCorrect})
  `;

  await sql`
    INSERT INTO card_progress (
      card_id,
      user_id,
      attempts_count,
      correct_count,
      incorrect_count,
      last_result,
      last_answered_at,
      updated_at
    )
    VALUES (
      ${cardId},
      ${userId},
      1,
      ${nextSchedule.isCorrect ? 1 : 0},
      ${nextSchedule.isCorrect ? 0 : 1},
      ${nextSchedule.isCorrect},
      NOW(),
      NOW()
    )
    ON CONFLICT (card_id)
    DO UPDATE SET
      attempts_count = card_progress.attempts_count + 1,
      correct_count = card_progress.correct_count + ${nextSchedule.isCorrect ? 1 : 0},
      incorrect_count = card_progress.incorrect_count + ${nextSchedule.isCorrect ? 0 : 1},
      last_result = ${nextSchedule.isCorrect},
      last_answered_at = NOW(),
      updated_at = NOW()
  `;

  await sql`
    UPDATE cards
    SET
      interval_days = ${nextSchedule.intervalDays},
      ease_factor = ${nextSchedule.easeFactor},
      repetitions = ${nextSchedule.repetitions},
      lapses = ${nextSchedule.lapses},
      due_at = ${nextSchedule.dueAt.toISOString()},
      updated_at = NOW()
    WHERE id = ${cardId} AND user_id = ${userId}
  `;

  const refreshedCard = await getCardById(cardId, userId);
  if (!refreshedCard) {
    throw new Error("Не вдалося оновити прогрес картки.");
  }

  return refreshedCard;
}

export async function saveTestSessionForUser({
  userId,
  sphere,
  title,
  mode,
  startedAt,
  finishedAt,
  attempts,
}: {
  userId: string;
  sphere: "stress" | "cards";
  title: string;
  mode: string | null;
  startedAt?: string;
  finishedAt?: string;
  attempts: SessionAttempt[];
}) {
  await ensureSchema();
  const sql = getSql();
  const total = attempts.length;
  const correct = attempts.filter((attempt) => attempt.isCorrect).length;
  const incorrect = total - correct;
  const safeStartedAt = startedAt ?? new Date().toISOString();
  const safeFinishedAt = finishedAt ?? new Date().toISOString();

  const rows = (await sql`
    INSERT INTO test_sessions (
      user_id,
      sphere,
      title,
      mode,
      total,
      correct,
      incorrect,
      started_at,
      finished_at,
      attempts_json
    )
    VALUES (
      ${userId},
      ${sphere},
      ${title},
      ${mode},
      ${total},
      ${correct},
      ${incorrect},
      ${safeStartedAt},
      ${safeFinishedAt},
      ${JSON.stringify(attempts)}::jsonb
    )
    RETURNING id
  `) as { id: number }[];

  const sessions = await listTestSessionsForUser(userId, sphere);
  const session = sessions.find((item) => item.id === rows[0].id);
  if (!session) {
    throw new Error("Не вдалося зберегти сесію.");
  }

  return session;
}

export async function listTestSessionsForUser(
  userId: string,
  sphere?: "stress" | "cards",
): Promise<TestSession[]> {
  await ensureSchema();
  const sql = getSql();

  const rows = sphere
    ? ((await sql`
        SELECT
          id,
          user_id,
          sphere,
          title,
          mode,
          total,
          correct,
          incorrect,
          started_at::text AS started_at,
          finished_at::text AS finished_at,
          attempts_json::text AS attempts_json
        FROM test_sessions
        WHERE user_id = ${userId}
          AND sphere = ${sphere}
        ORDER BY finished_at DESC
      `) as SessionRow[])
    : ((await sql`
        SELECT
          id,
          user_id,
          sphere,
          title,
          mode,
          total,
          correct,
          incorrect,
          started_at::text AS started_at,
          finished_at::text AS finished_at,
          attempts_json::text AS attempts_json
        FROM test_sessions
        WHERE user_id = ${userId}
        ORDER BY finished_at DESC
      `) as SessionRow[]);

  return rows.map(mapSession);
}
