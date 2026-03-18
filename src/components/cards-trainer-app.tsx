"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { calculateNextCardSchedule } from "@/lib/cards";
import { getCookieValue, setCookieValue } from "@/lib/client-cookies";
import type {
  Card,
  CardDeck,
  CardRating,
  CardReviewAttempt,
  TestSession,
} from "@/lib/types";
import { SunIcon, MoonIcon } from "./icons";

type ActiveTab = "test" | "manage" | "history";

type ActiveReview = {
  deckId: number;
  queue: Card[];
  index: number;
  revealed: boolean;
  rated: boolean;
  attempts: CardReviewAttempt[];
  startedAt: string;
};

const THEME_COOKIE_KEY = "learning-app-theme";

async function fetchJson<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error ?? "Не вдалося виконати запит.");
  }

  return payload;
}

function formatDate(value: string | null) {
  if (!value) {
    return "ще не було";
  }

  return new Date(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shuffleCards(queue: Card[]) {
  const nextQueue = [...queue];
  for (let index = nextQueue.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [nextQueue[index], nextQueue[randomIndex]] = [
      nextQueue[randomIndex],
      nextQueue[index],
    ];
  }
  return nextQueue;
}

function getLastAnsweredSortValue(card: Card) {
  if (card.progress.lastAnsweredAt) {
    const parsed = new Date(card.progress.lastAnsweredAt).getTime();
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return new Date(card.createdAt).getTime();
}

function buildReviewQueue(cards: Card[]) {
  const neverReviewed = cards.filter((card) => card.progress.attemptsCount === 0);
  const wrongRecently = cards
    .filter(
      (card) =>
        card.progress.attemptsCount > 0 && card.progress.lastResult === false,
    )
    .sort(
      (left, right) =>
        getLastAnsweredSortValue(left) - getLastAnsweredSortValue(right),
    );
  const oldReviewed = cards
    .filter(
      (card) =>
        card.progress.attemptsCount > 0 && card.progress.lastResult !== false,
    )
    .sort(
      (left, right) =>
        getLastAnsweredSortValue(left) - getLastAnsweredSortValue(right),
    );

  return [...shuffleCards(neverReviewed), ...wrongRecently, ...oldReviewed];
}

function TabButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "bg-(--accent) text-background"
          : "text-(--muted) hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

const cardClass = "rounded-2xl border border-(--card-border) bg-(--card)";
const inputClass =
  "w-full rounded-xl border border-(--card-border) bg-background px-4 py-3 text-foreground outline-none transition focus:border-[var(--foreground)] placeholder:text-(--muted)";
const btnPrimary =
  "rounded-xl bg-(--accent) px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-80 disabled:opacity-40";
const btnSecondary =
  "rounded-xl border border-(--card-border) bg-(--card) px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-[var(--foreground)]";

export function CardsTrainerApp({ userId }: { userId: string }) {
  const router = useRouter();
  const [decks, setDecks] = useState<CardDeck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<number | null>(null);
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [lastSession, setLastSession] = useState<CardReviewAttempt[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("test");
  const [deckInput, setDeckInput] = useState("");
  const [frontInput, setFrontInput] = useState("");
  const [backInput, setBackInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [failedReviewPayloads, setFailedReviewPayloads] = useState<
    { cardId: number; rating: CardRating }[]
  >([]);
  const [showSyncToast, setShowSyncToast] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeDeck = useMemo(
    () => decks.find((deck) => deck.id === activeDeckId) ?? null,
    [decks, activeDeckId],
  );

  const currentCard = activeReview?.queue[activeReview.index] ?? null;

  useEffect(() => {
    const storedTheme = getCookieValue(THEME_COOKIE_KEY);

    if (storedTheme) {
      setIsDarkMode(storedTheme === "dark");
    } else {
      setIsDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    setCookieValue(THEME_COOKIE_KEY, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      setError(null);

      try {
        const [decksResult, sessionsResult] = await Promise.all([
          fetchJson<{ decks: CardDeck[] }>(
            `/api/cards/decks?userId=${encodeURIComponent(userId)}`,
            { method: "GET" },
          ),
          fetchJson<{ sessions: TestSession[] }>(
            `/api/sessions?userId=${encodeURIComponent(userId)}&sphere=cards`,
            { method: "GET" },
          ),
        ]);

        setDecks(decksResult.decks);
        setSessions(sessionsResult.sessions);
        setActiveDeckId(
          (current) => current ?? decksResult.decks[0]?.id ?? null,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити дані карток.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadInitialData();
  }, [userId]);

  useEffect(() => {
    if (!userId || !activeDeckId) {
      setCards([]);
      return;
    }

    async function loadCards() {
      try {
        const result = await fetchJson<{ cards: Card[] }>(
          `/api/cards/decks/${activeDeckId}/cards?userId=${encodeURIComponent(
            userId,
          )}&dueOnly=false`,
          { method: "GET" },
        );
        setCards(result.cards);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити картки колоди.",
        );
      }
    }

    void loadCards();
  }, [userId, activeDeckId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (failedReviewPayloads.length > 0) {
      setShowSyncToast(true);
      return;
    }

    if (pendingSaves > 0) {
      timer = setTimeout(() => {
        setShowSyncToast(true);
      }, 350);
    } else {
      setShowSyncToast(false);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [pendingSaves, failedReviewPayloads.length]);

  function resetFlashMessages() {
    setMessage(null);
    setError(null);
  }

  async function enqueueReviewSave(payload: {
    cardId: number;
    rating: CardRating;
  }) {
    setPendingSaves((count) => count + 1);
    try {
      const result = await fetchJson<{ card: Card }>("/api/cards/review", {
        method: "POST",
        body: JSON.stringify({
          userId,
          cardId: payload.cardId,
          rating: payload.rating,
        }),
      });

      setCards((currentCards) =>
        currentCards.map((item) =>
          item.id === result.card.id ? result.card : item,
        ),
      );
      setFailedReviewPayloads((current) =>
        current.filter(
          (item) =>
            !(item.cardId === payload.cardId && item.rating === payload.rating),
        ),
      );
    } catch {
      setFailedReviewPayloads((current) => [...current, payload]);
      setError(
        "Частину відповідей не вдалося зберегти. Можна продовжувати тест і повторити синхронізацію пізніше.",
      );
    } finally {
      setPendingSaves((count) => Math.max(0, count - 1));
    }
  }

  async function retryFailedSaves() {
    const queue = [...failedReviewPayloads];
    setFailedReviewPayloads([]);
    for (const payload of queue) {
      await enqueueReviewSave(payload);
    }
  }

  async function handleCreateDeck(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    resetFlashMessages();
    try {
      const result = await fetchJson<{ deck: CardDeck }>("/api/cards/decks", {
        method: "POST",
        body: JSON.stringify({ userId, name: deckInput }),
      });
      setDecks((current) => [
        result.deck,
        ...current.filter((d) => d.id !== result.deck.id),
      ]);
      setActiveDeckId(result.deck.id);
      setDeckInput("");
      setMessage("Колоду збережено.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не вдалося зберегти колоду.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteDeck(deckId: number) {
    resetFlashMessages();
    try {
      await fetchJson<{ success: true }>(
        `/api/cards/decks/${deckId}?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      setDecks((current) => current.filter((deck) => deck.id !== deckId));
      setActiveDeckId((current) => (current === deckId ? null : current));
      if (activeReview?.deckId === deckId) {
        setActiveReview(null);
      }
      setMessage("Колоду видалено.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не вдалося видалити колоду.",
      );
    }
  }

  async function handleCreateCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !activeDeckId) {
      return;
    }

    setIsSaving(true);
    resetFlashMessages();
    try {
      const result = await fetchJson<{ card: Card }>(
        `/api/cards/decks/${activeDeckId}/cards`,
        {
          method: "POST",
          body: JSON.stringify({
            userId,
            front: frontInput,
            back: backInput,
          }),
        },
      );

      setCards((current) => [
        result.card,
        ...current.filter((c) => c.id !== result.card.id),
      ]);
      setFrontInput("");
      setBackInput("");
      setMessage("Картку додано.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не вдалося зберегти картку.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImportCards() {
    if (!userId || !activeDeckId) {
      return;
    }

    setIsSaving(true);
    resetFlashMessages();
    try {
      const result = await fetchJson<{
        savedCards: Card[];
        errors: { value: string; message: string }[];
      }>("/api/cards/import", {
        method: "POST",
        body: JSON.stringify({
          userId,
          deckId: activeDeckId,
          text: bulkInput,
        }),
      });

      setCards((current) => [...result.savedCards, ...current]);
      setBulkInput("");

      if (result.errors.length > 0) {
        setError(
          `Імпортовано ${result.savedCards.length} карток. Помилки: ${result.errors
            .map((item) => `${item.value} (${item.message})`)
            .join("; ")}`,
        );
      } else {
        setMessage(`Імпортовано ${result.savedCards.length} карток.`);
      }
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Не вдалося імпортувати картки.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteCard(cardId: number) {
    resetFlashMessages();
    try {
      await fetchJson<{ success: true }>(
        `/api/cards/cards/${cardId}?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      setCards((current) => current.filter((card) => card.id !== cardId));
      setMessage("Картку видалено.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не вдалося видалити картку.",
      );
    }
  }

  async function startReview() {
    if (!activeDeckId) {
      setError("Оберіть колоду.");
      return;
    }

    resetFlashMessages();
    try {
      const result = await fetchJson<{ cards: Card[] }>(
        `/api/cards/decks/${activeDeckId}/cards?userId=${encodeURIComponent(
          userId,
        )}&dueOnly=false`,
        { method: "GET" },
      );
      setCards(result.cards);

      const queue = buildReviewQueue(result.cards);
      if (queue.length === 0) {
        setError("У цій колоді ще немає карток.");
        return;
      }

      setLastSession([]);
      setActiveReview({
        deckId: activeDeckId,
        queue,
        index: 0,
        revealed: false,
        rated: false,
        attempts: [],
        startedAt: new Date().toISOString(),
      });
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Не вдалося розпочати повторення.",
      );
    }
  }

  async function persistReviewSession(
    attempts: CardReviewAttempt[],
    startedAt: string,
  ) {
    if (!userId || !activeDeck) {
      return;
    }

    try {
      const result = await fetchJson<{ session: TestSession }>(
        "/api/sessions",
        {
          method: "POST",
          body: JSON.stringify({
            userId,
            sphere: "cards",
            title: `Колодa: ${activeDeck.name}`,
            mode: "anki-review",
            startedAt,
            finishedAt: new Date().toISOString(),
            attempts: attempts.map((attempt) => ({
              itemId: attempt.cardId,
              prompt: attempt.front,
              answer: attempt.back,
              chosen: attempt.rating,
              isCorrect: attempt.isCorrect,
            })),
          }),
        },
      );

      setSessions((current) => [result.session, ...current]);
    } catch {
      setError("Сесію завершено, але не вдалося одразу зберегти її в історію.");
    }
  }

  function finishReview(forceAttempts?: CardReviewAttempt[]) {
    if (!activeReview) {
      return;
    }

    const attempts = forceAttempts ?? activeReview.attempts;
    setLastSession(attempts);
    setActiveReview(null);
    void persistReviewSession(attempts, activeReview.startedAt);
  }

  function handleRate(rating: CardRating) {
    if (
      !activeReview ||
      !currentCard ||
      !activeReview.revealed ||
      activeReview.rated
    ) {
      return;
    }

    const nextSchedule = calculateNextCardSchedule(
      {
        intervalDays: currentCard.intervalDays,
        easeFactor: currentCard.easeFactor,
        repetitions: currentCard.repetitions,
        lapses: currentCard.lapses,
      },
      rating,
    );

    const attempt: CardReviewAttempt = {
      cardId: currentCard.id,
      front: currentCard.front,
      back: currentCard.back,
      rating,
      isCorrect: nextSchedule.isCorrect,
    };

    const optimisticCard: Card = {
      ...currentCard,
      dueAt: nextSchedule.dueAt.toISOString(),
      intervalDays: nextSchedule.intervalDays,
      easeFactor: nextSchedule.easeFactor,
      repetitions: nextSchedule.repetitions,
      lapses: nextSchedule.lapses,
      progress: {
        attemptsCount: currentCard.progress.attemptsCount + 1,
        correctCount:
          currentCard.progress.correctCount + (nextSchedule.isCorrect ? 1 : 0),
        incorrectCount:
          currentCard.progress.incorrectCount +
          (nextSchedule.isCorrect ? 0 : 1),
        lastResult: nextSchedule.isCorrect,
        lastAnsweredAt: new Date().toISOString(),
      },
    };

    setCards((current) =>
      current.map((item) =>
        item.id === optimisticCard.id ? optimisticCard : item,
      ),
    );

    setActiveReview((current) =>
      current
        ? {
            ...current,
            rated: true,
            attempts: [...current.attempts, attempt],
            queue: current.queue.map((item) =>
              item.id === optimisticCard.id ? optimisticCard : item,
            ),
          }
        : current,
    );

    void enqueueReviewSave({ cardId: currentCard.id, rating });
  }

  function handleAdvance() {
    if (!activeReview || !activeReview.rated) {
      return;
    }

    const nextIndex = activeReview.index + 1;
    if (nextIndex >= activeReview.queue.length) {
      finishReview(activeReview.attempts);
      return;
    }

    setActiveReview({
      ...activeReview,
      index: nextIndex,
      revealed: false,
      rated: false,
    });
  }

  const cardsTotal = cards.length;
  const dueTotal = cards.filter(
    (card) => new Date(card.dueAt) <= new Date(),
  ).length;

  const sessionSummary = useMemo(() => {
    const source = activeReview?.attempts ?? lastSession;
    const correct = source.filter((attempt) => attempt.isCorrect).length;
    return {
      total: source.length,
      correct,
      incorrect: source.length - correct,
      attempts: source,
    };
  }, [activeReview?.attempts, lastSession]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-sm"
            >
              &larr;
            </button>
            Картки
          </h1>

          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-xs font-medium text-(--muted)">
              {userId}
            </span>
            <button
              type="button"
              onClick={() => setIsDarkMode((v) => !v)}
              className={`${btnSecondary} px-2.5 py-2.5`}
              aria-label={isDarkMode ? "Світла тема" : "Темна тема"}
            >
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
              Картки
            </p>
            <p className="mt-1 text-2xl font-display font-semibold text-foreground">
              {cardsTotal}
            </p>
          </div>
          <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
              На повтор
            </p>
            <p className="mt-1 text-2xl font-display font-semibold text-foreground">
              {dueTotal}
            </p>
          </div>
          <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
              Сесії
            </p>
            <p className="mt-1 text-2xl font-display font-semibold text-foreground">
              {sessions.length}
            </p>
          </div>
        </div>

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {showSyncToast ? (
          <div className="fixed right-4 bottom-4 z-50 w-[min(26rem,calc(100%-2rem))] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-lg dark:border-amber-900/50 dark:bg-amber-950/90 dark:text-amber-300">
            <div className="flex items-center justify-between gap-3">
              <p>
                Синхронізація відповідей: {pendingSaves} в роботі,{" "}
                {failedReviewPayloads.length} помилок.
              </p>
              {failedReviewPayloads.length > 0 ? (
                <button
                  type="button"
                  onClick={retryFailedSaves}
                  className={btnSecondary}
                >
                  Повторити
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex gap-1 border-b border-(--card-border)">
          <TabButton
            isActive={activeTab === "test"}
            onClick={() => setActiveTab("test")}
          >
            Тестування
          </TabButton>
          <TabButton
            isActive={activeTab === "manage"}
            onClick={() => setActiveTab("manage")}
          >
            Керування
          </TabButton>
          <TabButton
            isActive={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          >
            Історія
          </TabButton>
        </div>

        {activeTab === "test" ? (
          <section className="space-y-5">
            <div className={`${cardClass} p-6`}>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={activeDeckId ?? ""}
                  onChange={(event) =>
                    setActiveDeckId(Number(event.target.value) || null)
                  }
                  className={inputClass}
                >
                  <option value="">Оберіть колоду</option>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name} ({deck.dueCount}/{deck.cardCount})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={startReview}
                  className={btnPrimary}
                >
                  Почати повторення
                </button>
              </div>
            </div>

            {activeReview && currentCard ? (
              <div className={`${cardClass} p-6`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-widest text-(--muted)">
                    {activeReview.index + 1} / {activeReview.queue.length}
                  </p>
                  <button
                    type="button"
                    onClick={() => finishReview(activeReview.attempts)}
                    className={btnSecondary}
                  >
                    Завершити
                  </button>
                </div>

                <div className="mt-8 rounded-xl border border-(--card-border) bg-background p-6">
                  <p className="text-xs uppercase tracking-widest text-(--muted)">
                    Питання
                  </p>
                  <p className="mt-2 text-2xl font-display text-foreground">
                    {currentCard.front}
                  </p>
                </div>

                {activeReview.revealed ? (
                  <div className="mt-4 rounded-xl border border-(--card-border) bg-background p-6">
                    <p className="text-xs uppercase tracking-widest text-(--muted)">
                      Відповідь
                    </p>
                    <p className="mt-2 text-xl text-foreground">
                      {currentCard.back}
                    </p>
                  </div>
                ) : null}

                {!activeReview.revealed ? (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveReview((current) =>
                        current ? { ...current, revealed: true } : current,
                      )
                    }
                    className={`${btnPrimary} mt-5`}
                  >
                    Показати відповідь
                  </button>
                ) : (
                  <div className="mt-5 space-y-3">
                    {!activeReview.rated ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleRate("again")}
                          className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500"
                        >
                          Again
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRate("hard")}
                          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-amber-400"
                        >
                          Hard
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRate("good")}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                        >
                          Good
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRate("easy")}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
                        >
                          Easy
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleAdvance}
                        className={btnPrimary}
                      >
                        Наступна картка
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {!activeReview && sessionSummary.total > 0 ? (
              <div className={`${cardClass} p-6`}>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  Результати останньої сесії
                </h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3 text-sm">
                    Усього: {sessionSummary.total}
                  </div>
                  <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3 text-sm">
                    Правильно: {sessionSummary.correct}
                  </div>
                  <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3 text-sm">
                    Помилок: {sessionSummary.incorrect}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "manage" ? (
          <section className="space-y-5">
            <div className={`${cardClass} p-6`}>
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Колоди
              </h2>
              <form className="mt-4 flex gap-3" onSubmit={handleCreateDeck}>
                <input
                  value={deckInput}
                  onChange={(event) => setDeckInput(event.target.value)}
                  placeholder="Назва колоди"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  className={btnPrimary}
                >
                  Додати
                </button>
              </form>

              <div className="mt-4 space-y-2">
                {decks.map((deck) => (
                  <div
                    key={deck.id}
                    className="flex items-center justify-between rounded-xl border border-(--card-border) bg-background px-4 py-3"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveDeckId(deck.id)}
                      className="text-left text-sm text-foreground"
                    >
                      {deck.name} ({deck.cardCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDeck(deck.id)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60"
                    >
                      Видалити
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${cardClass} p-6`}>
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Картки
              </h2>
              {activeDeck ? (
                <>
                  <p className="mt-2 text-sm text-(--muted)">
                    Колода: {activeDeck.name}
                  </p>
                  <form className="mt-4 space-y-3" onSubmit={handleCreateCard}>
                    <input
                      value={frontInput}
                      onChange={(event) => setFrontInput(event.target.value)}
                      placeholder="Лицьова сторона"
                      className={inputClass}
                    />
                    <input
                      value={backInput}
                      onChange={(event) => setBackInput(event.target.value)}
                      placeholder="Зворотна сторона"
                      className={inputClass}
                    />
                    <button
                      type="submit"
                      disabled={isSaving}
                      className={btnPrimary}
                    >
                      Додати картку
                    </button>
                  </form>

                  <div className="mt-6 border-t border-(--card-border) pt-6">
                    <label className="mb-2 block text-xs uppercase tracking-widest text-(--muted)">
                      Масовий імпорт (формат: front - back)
                    </label>
                    <textarea
                      value={bulkInput}
                      onChange={(event) => setBulkInput(event.target.value)}
                      className={`${inputClass} min-h-40`}
                      placeholder={"hello - привіт\nthank you - дякую"}
                    />
                    <button
                      type="button"
                      onClick={handleImportCards}
                      disabled={isSaving}
                      className={`${btnPrimary} mt-4`}
                    >
                      Імпортувати
                    </button>
                  </div>

                  <div className="mt-6 space-y-2">
                    {isLoading ? (
                      <p className="text-sm text-(--muted)">Завантаження...</p>
                    ) : cards.length === 0 ? (
                      <p className="text-sm text-(--muted)">
                        У цій колоді ще немає карток.
                      </p>
                    ) : (
                      cards.map((card) => (
                        <div
                          key={card.id}
                          className="rounded-xl border border-(--card-border) bg-background p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">
                                {card.front}
                              </p>
                              <p className="text-sm text-(--muted)">
                                {card.back}
                              </p>
                              <p className="text-xs text-(--muted)">
                                Повтор: {formatDate(card.dueAt)} ·{" "}
                                {card.progress.attemptsCount} спроб
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteCard(card.id)}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60"
                            >
                              Видалити
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-(--muted)">
                  Спочатку створіть або оберіть колоду.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className={`${cardClass} p-6`}>
            <h2 className="font-display text-2xl font-semibold text-foreground">
              Історія тестів
            </h2>
            <div className="mt-4 space-y-3">
              {sessions.length === 0 ? (
                <p className="text-sm text-(--muted)">
                  Поки що немає завершених сесій.
                </p>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-xl border border-(--card-border) bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-foreground">
                          {session.title}
                        </p>
                        <p className="text-xs text-(--muted)">
                          {formatDate(session.finishedAt)}
                        </p>
                      </div>
                      <div className="text-right text-xs text-(--muted)">
                        <p>Усього: {session.total}</p>
                        <p>Правильно: {session.correct}</p>
                        <p>Помилок: {session.incorrect}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
