"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  formatSourceTextWithStress,
  isCorrectStressPick,
  isUkrainianVowel,
  splitStressSourceText,
} from "@/lib/stress";
import { getCookieValue, setCookieValue } from "@/lib/client-cookies";
import type {
  StressSessionAttempt,
  StressWord,
  TestSession,
} from "@/lib/types";
import { SunIcon, MoonIcon } from "./icons";

type TestMode = "random" | "learning";
type ActiveTab = "test" | "manage" | "history";

type ActiveTest = {
  mode: TestMode;
  queue: StressWord[];
  index: number;
  selectedVowelIndex: number | null;
  answered: boolean;
  sessionAttempts: StressSessionAttempt[];
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

function shuffleWords(words: StressWord[]) {
  const shuffledWords = [...words];

  for (let index = shuffledWords.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [shuffledWords[index], shuffledWords[nextIndex]] = [
      shuffledWords[nextIndex],
      shuffledWords[index],
    ];
  }

  return shuffledWords;
}

function getLearningPriority(word: StressWord) {
  if (word.progress.attemptsCount === 0) {
    return 0;
  }

  if (word.progress.lastResult === false) {
    return 1;
  }

  return 2;
}

function buildLearningQueue(words: StressWord[]) {
  return [...words].sort((left, right) => {
    const priorityDifference =
      getLearningPriority(left) - getLearningPriority(right);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const leftDate =
      left.progress.lastAnsweredAt ??
      left.createdAt ??
      "9999-12-31T00:00:00.000Z";
    const rightDate =
      right.progress.lastAnsweredAt ??
      right.createdAt ??
      "9999-12-31T00:00:00.000Z";

    return leftDate.localeCompare(rightDate);
  });
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

function upsertWord(words: StressWord[], word: StressWord) {
  const nextWords = words.filter((item) => item.id !== word.id);
  nextWords.push(word);
  return nextWords.sort((left, right) =>
    left.displayWord.localeCompare(right.displayWord, "uk-UA"),
  );
}

function StatsBadge({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
        {label}
      </p>
      <p className="mt-1 text-2xl font-display font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
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

export function StressTrainerApp({ userId }: { userId: string }) {
  const router = useRouter();
  const [words, setWords] = useState<StressWord[]>([]);
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingWord, setIsSavingWord] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [wordInput, setWordInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTest, setActiveTest] = useState<ActiveTest | null>(null);
  const [lastSession, setLastSession] = useState<StressSessionAttempt[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("test");
  const [isWordListExpanded, setIsWordListExpanded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [pendingAttemptSaves, setPendingAttemptSaves] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState<
    { wordId: number; chosenIndex: number; isCorrect: boolean }[]
  >([]);

  const currentWord = activeTest?.queue[activeTest.index] ?? null;
  const currentWordTrailingText = currentWord
    ? splitStressSourceText(currentWord.sourceText).trailingText
    : "";

  const totalAttempts = useMemo(
    () => words.reduce((sum, word) => sum + word.progress.attemptsCount, 0),
    [words],
  );

  const totalNeverTested = useMemo(
    () => words.filter((word) => word.progress.attemptsCount === 0).length,
    [words],
  );

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
    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        const [wordsResult, sessionsResult] = await Promise.all([
          fetchJson<{ words: StressWord[] }>(
            `/api/words?userId=${encodeURIComponent(userId)}`,
            { method: "GET" },
          ),
          fetchJson<{ sessions: TestSession[] }>(
            `/api/sessions?userId=${encodeURIComponent(userId)}&sphere=stress`,
            { method: "GET" },
          ),
        ]);
        setWords(wordsResult.words);
        setSessions(sessionsResult.sessions);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити дані.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, [userId]);

  const sessionSummary = useMemo(() => {
    const source = activeTest?.sessionAttempts ?? lastSession;
    const correct = source.filter((item) => item.isCorrect).length;

    return {
      total: source.length,
      correct,
      incorrect: source.length - correct,
      attempts: source,
    };
  }, [activeTest?.sessionAttempts, lastSession]);

  function resetFlashMessages() {
    setError(null);
    setMessage(null);
  }

  async function enqueueAttemptSave(payload: {
    wordId: number;
    chosenIndex: number;
    isCorrect: boolean;
  }) {
    setPendingAttemptSaves((count) => count + 1);
    try {
      const result = await fetchJson<{ word: StressWord }>(
        "/api/test-attempts",
        {
          method: "POST",
          body: JSON.stringify({
            userId,
            wordId: payload.wordId,
            chosenIndex: payload.chosenIndex,
            isCorrect: payload.isCorrect,
          }),
        },
      );
      setWords((currentWords) => upsertWord(currentWords, result.word));
      setActiveTest((current) =>
        current
          ? {
              ...current,
              queue: current.queue.map((item) =>
                item.id === result.word.id ? result.word : item,
              ),
            }
          : current,
      );
      setFailedAttempts((current) =>
        current.filter(
          (item) =>
            !(
              item.wordId === payload.wordId &&
              item.chosenIndex === payload.chosenIndex &&
              item.isCorrect === payload.isCorrect
            ),
        ),
      );
    } catch {
      setFailedAttempts((current) => [...current, payload]);
      setError(
        "Частину відповідей не вдалося зберегти. Можна продовжувати тест і повторити синхронізацію.",
      );
    } finally {
      setPendingAttemptSaves((count) => Math.max(0, count - 1));
    }
  }

  async function retryFailedAttempts() {
    const pending = [...failedAttempts];
    setFailedAttempts([]);
    for (const payload of pending) {
      await enqueueAttemptSave(payload);
    }
  }

  async function persistStressSession(
    attempts: StressSessionAttempt[],
    mode: TestMode | null,
    startedAt: string,
  ) {
    try {
      const result = await fetchJson<{ session: TestSession }>(
        "/api/sessions",
        {
          method: "POST",
          body: JSON.stringify({
            userId,
            sphere: "stress",
            title: "Тренажер наголосів",
            mode,
            startedAt,
            finishedAt: new Date().toISOString(),
            attempts: attempts.map((attempt) => ({
              itemId: attempt.wordId,
              prompt: attempt.word,
              answer: formatSourceTextWithStress(
                attempt.sourceText,
                attempt.word,
                attempt.correctPositions,
              ),
              chosen: String(attempt.chosenIndex),
              isCorrect: attempt.isCorrect,
            })),
          }),
        },
      );

      setSessions((current) => [result.session, ...current]);
    } catch {
      setError("Сесію завершено, але не вдалося одразу зберегти в історію.");
    }
  }

  function finishTest(forceAttempts?: StressSessionAttempt[]) {
    const attempts = forceAttempts ?? activeTest?.sessionAttempts ?? [];
    const mode = activeTest?.mode ?? null;
    const startedAt = activeTest?.startedAt ?? new Date().toISOString();
    setLastSession(attempts);
    setActiveTest(null);
    if (attempts.length > 0) {
      void persistStressSession(attempts, mode, startedAt);
    }
  }

  function startTest(mode: TestMode) {
    if (words.length === 0) {
      setError("Спочатку додайте хоча б одне слово.");
      return;
    }

    const queue =
      mode === "random" ? shuffleWords(words) : buildLearningQueue(words);

    setLastSession([]);
    setActiveTest({
      mode,
      queue,
      index: 0,
      selectedVowelIndex: null,
      answered: false,
      sessionAttempts: [],
      startedAt: new Date().toISOString(),
    });
    setMessage(null);
    setError(null);
  }

  async function handleWordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingWord(true);
    resetFlashMessages();

    try {
      const endpoint = editingWordId
        ? `/api/words/${editingWordId}`
        : "/api/words";
      const method = editingWordId ? "PATCH" : "POST";

      const result = await fetchJson<{ word: StressWord }>(endpoint, {
        method,
        body: JSON.stringify({ userId, word: wordInput }),
      });

      setWords((currentWords) => upsertWord(currentWords, result.word));
      setWordInput("");
      setEditingWordId(null);
      setMessage(
        editingWordId ? "Слово успішно оновлено." : "Слово успішно додано.",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не вдалося зберегти слово.",
      );
    } finally {
      setIsSavingWord(false);
    }
  }

  async function handleImportWords() {
    setIsImporting(true);
    resetFlashMessages();

    try {
      const result = await fetchJson<{
        savedWords: StressWord[];
        errors: { value: string; message: string }[];
      }>("/api/words/import", {
        method: "POST",
        body: JSON.stringify({ userId, text: bulkInput }),
      });

      setWords((currentWords) =>
        result.savedWords.reduce(upsertWord, currentWords),
      );
      setBulkInput("");

      if (result.errors.length > 0) {
        setError(
          `Імпортовано ${result.savedWords.length} слів. Помилки: ${result.errors
            .map((item) => `${item.value} (${item.message})`)
            .join("; ")}`,
        );
      } else {
        setMessage(`Імпортовано ${result.savedWords.length} слів.`);
      }
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Не вдалося імпортувати слова.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function handleDeleteWord(wordId: number) {
    resetFlashMessages();

    try {
      await fetchJson<{ success: true }>(
        `/api/words/${wordId}?userId=${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
        },
      );

      setWords((currentWords) =>
        currentWords.filter((word) => word.id !== wordId),
      );

      if (editingWordId === wordId) {
        setEditingWordId(null);
        setWordInput("");
      }

      if (activeTest?.queue.some((word) => word.id === wordId)) {
        finishTest(activeTest.sessionAttempts);
      }

      setMessage("Слово видалено.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не вдалося видалити слово.",
      );
    }
  }

  function handleEditWord(word: StressWord) {
    setActiveTab("manage");
    setIsWordListExpanded(true);
    setEditingWordId(word.id);
    setWordInput(word.sourceText);
    setMessage(null);
    setError(null);
  }

  function handleAnswer(word: StressWord, chosenIndex: number) {
    if (!activeTest || activeTest.answered) {
      return;
    }

    const isCorrect = isCorrectStressPick(word.stressPositions, chosenIndex);
    const now = new Date().toISOString();
    const nextAttempt: StressSessionAttempt = {
      wordId: word.id,
      word: word.displayWord,
      sourceText: word.sourceText,
      chosenIndex,
      correctPositions: word.stressPositions,
      isCorrect,
    };

    const optimisticWord: StressWord = {
      ...word,
      progress: {
        attemptsCount: word.progress.attemptsCount + 1,
        correctCount: word.progress.correctCount + (isCorrect ? 1 : 0),
        incorrectCount: word.progress.incorrectCount + (isCorrect ? 0 : 1),
        lastResult: isCorrect,
        lastAnsweredAt: now,
      },
    };

    setWords((currentWords) => upsertWord(currentWords, optimisticWord));
    setActiveTest((currentTest) =>
      currentTest
        ? {
            ...currentTest,
            selectedVowelIndex: chosenIndex,
            answered: true,
            sessionAttempts: [...currentTest.sessionAttempts, nextAttempt],
            queue: currentTest.queue.map((item) =>
              item.id === optimisticWord.id ? optimisticWord : item,
            ),
          }
        : currentTest,
    );

    void enqueueAttemptSave({
      wordId: word.id,
      chosenIndex,
      isCorrect,
    });
  }

  function handleAdvance() {
    if (!activeTest || !activeTest.answered) {
      return;
    }

    const nextIndex = activeTest.index + 1;

    if (nextIndex >= activeTest.queue.length) {
      finishTest(activeTest.sessionAttempts);
      return;
    }

    setActiveTest({
      ...activeTest,
      index: nextIndex,
      selectedVowelIndex: null,
      answered: false,
    });
  }

  const inputClass =
    "w-full rounded-xl border border-(--card-border) bg-background px-4 py-3 text-foreground outline-none transition focus:border-[var(--foreground)] placeholder:text-(--muted)";

  const btnPrimary =
    "rounded-xl bg-(--accent) px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-80 disabled:opacity-40";

  const btnSecondary =
    "rounded-xl border border-(--card-border) bg-(--card) px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-[var(--foreground)]";

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-sm"
            >
              &larr;
            </button>
            Наголоси
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
          <StatsBadge label="Слова" value={words.length} />
          <StatsBadge label="Нові" value={totalNeverTested} />
          <StatsBadge label="Відповіді" value={totalAttempts} />
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

        {pendingAttemptSaves > 0 || failedAttempts.length > 0 ? (
          <div className="fixed right-4 bottom-4 z-50 w-[min(26rem,calc(100%-2rem))] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-lg dark:border-amber-900/50 dark:bg-amber-950/90 dark:text-amber-300">
            <div className="flex items-center justify-between gap-3">
              <p>
                Синхронізація відповідей: {pendingAttemptSaves} в роботі,{" "}
                {failedAttempts.length} помилок.
              </p>
              {failedAttempts.length > 0 ? (
                <button
                  type="button"
                  onClick={retryFailedAttempts}
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
            Керування словами
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
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => startTest("random")}
                className={btnPrimary}
              >
                Випадковий режим
              </button>
              <button
                type="button"
                onClick={() => startTest("learning")}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                Навчальний режим
              </button>
            </div>

            {activeTest && currentWord ? (
              <div
                className={`${cardClass} p-6 transition ${
                  activeTest.answered ? "cursor-pointer" : ""
                }`}
                onClick={handleAdvance}
                role={activeTest.answered ? "button" : undefined}
                tabIndex={activeTest.answered ? 0 : -1}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-widest text-(--muted)">
                    {activeTest.mode === "random" ? "Випадковий" : "Навчальний"}
                    {" · "}
                    {activeTest.index + 1} / {activeTest.queue.length}
                  </p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      finishTest(activeTest.sessionAttempts);
                    }}
                    className={btnSecondary}
                  >
                    Завершити
                  </button>
                </div>

                <div className="mt-10 flex justify-center">
                  <div className="flex flex-wrap items-baseline justify-center gap-1 text-4xl font-semibold sm:text-5xl">
                    {[...currentWord.displayWord].map((character, index) => {
                      const isVowel = isUkrainianVowel(character);
                      const isCorrect =
                        currentWord.stressPositions.includes(index);
                      const isSelected =
                        activeTest.selectedVowelIndex === index;

                      let className =
                        "rounded-lg px-1.5 py-1 transition font-display tracking-tight";

                      if (!isVowel) {
                        className += " text-foreground cursor-default";
                      } else if (!activeTest.answered) {
                        className +=
                          " cursor-pointer border border-(--card-border) text-foreground hover:border-[var(--foreground)] hover:bg-background";
                      } else if (isCorrect) {
                        className +=
                          " bg-emerald-500 text-white border border-emerald-500";
                      } else if (isSelected) {
                        className +=
                          " bg-rose-500 text-white border border-rose-500";
                      } else {
                        className +=
                          " border border-(--card-border) text-(--muted)";
                      }

                      return (
                        <button
                          key={`${character}-${index}`}
                          type="button"
                          disabled={!isVowel || activeTest.answered}
                          className={className}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isVowel) return;
                            handleAnswer(currentWord, index);
                          }}
                        >
                          {character}
                        </button>
                      );
                    })}

                    {currentWordTrailingText ? (
                      <span className="ml-2 text-xl font-normal text-(--muted)">
                        {currentWordTrailingText}
                      </span>
                    ) : null}
                  </div>
                </div>

                {activeTest.answered ? (
                  <div className="mt-8 border-t border-(--card-border) pt-5">
                    <p
                      className={`text-sm font-medium ${
                        activeTest.selectedVowelIndex !== null &&
                        currentWord.stressPositions.includes(
                          activeTest.selectedVowelIndex,
                        )
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {activeTest.selectedVowelIndex !== null &&
                      currentWord.stressPositions.includes(
                        activeTest.selectedVowelIndex,
                      )
                        ? "Правильно!"
                        : `Неправильно. Правильний варіант: ${formatSourceTextWithStress(
                            currentWord.sourceText,
                            currentWord.displayWord,
                            currentWord.stressPositions,
                          )}`}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!activeTest && sessionSummary.total > 0 ? (
              <div className={`${cardClass} p-6`}>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  Результати
                </h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <StatsBadge label="Усього" value={sessionSummary.total} />
                  <StatsBadge
                    label="Правильно"
                    value={sessionSummary.correct}
                  />
                  <StatsBadge
                    label="Помилок"
                    value={sessionSummary.incorrect}
                  />
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "manage" ? (
          <section className="space-y-5">
            <div className={`${cardClass} p-6`}>
              <p className="text-xs text-(--muted)">
                Приклад:{" "}
                <span className="font-medium text-foreground">завдАння</span>{" "}
                або{" "}
                <span className="font-medium text-foreground">
                  хАос (у міфології: стихія)
                </span>
              </p>

              <form className="mt-5 space-y-4" onSubmit={handleWordSubmit}>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-widest text-(--muted)">
                    {editingWordId ? "Редагувати слово" : "Нове слово"}
                  </span>
                  <input
                    value={wordInput}
                    onChange={(event) => setWordInput(event.target.value)}
                    className={inputClass}
                    placeholder="вИпадок"
                  />
                </label>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isSavingWord}
                    className={btnPrimary}
                  >
                    {isSavingWord
                      ? "Зберігаємо..."
                      : editingWordId
                        ? "Оновити"
                        : "Додати"}
                  </button>

                  {editingWordId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWordId(null);
                        setWordInput("");
                      }}
                      className={btnSecondary}
                    >
                      Скасувати
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="mt-8 border-t border-(--card-border) pt-6">
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-widest text-(--muted)">
                    Масовий імпорт
                  </span>
                  <textarea
                    value={bulkInput}
                    onChange={(event) => setBulkInput(event.target.value)}
                    className={`${inputClass} min-h-36`}
                    placeholder={"вИпадок\nзАвжди\nводопровІд\nперепИс"}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleImportWords}
                  disabled={isImporting}
                  className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isImporting ? "Імпортуємо..." : "Імпортувати слова"}
                </button>
              </div>
            </div>

            <div className={`${cardClass} p-6`}>
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  Список слів
                </h2>
                <button
                  type="button"
                  onClick={() => setIsWordListExpanded((v) => !v)}
                  className={btnSecondary}
                >
                  {isWordListExpanded
                    ? "Сховати"
                    : `Показати (${words.length})`}
                </button>
              </div>

              {isWordListExpanded ? (
                <div className="mt-5">
                  {isLoading ? (
                    <p className="text-sm text-(--muted)">Завантаження...</p>
                  ) : words.length === 0 ? (
                    <p className="text-sm text-(--muted)">
                      Поки що немає слів. Додайте перше слово вручну або через
                      імпорт.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {words.map((word) => (
                        <div
                          key={word.id}
                          className="rounded-xl border border-(--card-border) bg-background p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-display text-xl font-medium text-foreground">
                                {formatSourceTextWithStress(
                                  word.sourceText,
                                  word.displayWord,
                                  word.stressPositions,
                                )}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full border border-(--card-border) px-2.5 py-0.5 text-(--muted)">
                                  {word.progress.attemptsCount} спроб
                                </span>
                                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                  {word.progress.correctCount} ✓
                                </span>
                                <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                                  {word.progress.incorrectCount} ✗
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-(--muted)">
                                {formatDate(word.progress.lastAnsweredAt)}
                              </p>
                            </div>

                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditWord(word)}
                                className={btnSecondary}
                              >
                                Редагувати
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWord(word.id)}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60"
                              >
                                Видалити
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
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
