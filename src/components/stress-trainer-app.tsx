"use client";

import { useEffect, useMemo, useState } from "react";

import {
  formatSourceTextWithStress,
  isCorrectStressPick,
  isUkrainianVowel,
  splitStressSourceText,
} from "@/lib/stress";
import type { SessionAttempt, StressWord } from "@/lib/types";

type TestMode = "random" | "learning";
type ActiveTab = "test" | "manage";

type ActiveTest = {
  mode: TestMode;
  queue: StressWord[];
  index: number;
  selectedVowelIndex: number | null;
  answered: boolean;
  sessionAttempts: SessionAttempt[];
};

const STORAGE_KEY = "learning-app-user-id";
const THEME_STORAGE_KEY = "learning-app-theme";

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
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
      left.progress.lastAnsweredAt ?? left.createdAt ?? "9999-12-31T00:00:00.000Z";
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

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

const cardClass =
  "rounded-2xl border border-(--card-border) bg-(--card)";

export function StressTrainerApp() {
  const [userIdInput, setUserIdInput] = useState("");
  const [userId, setUserId] = useState("");
  const [words, setWords] = useState<StressWord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingWord, setIsSavingWord] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSubmittingAttempt, setIsSubmittingAttempt] = useState(false);
  const [wordInput, setWordInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTest, setActiveTest] = useState<ActiveTest | null>(null);
  const [lastSession, setLastSession] = useState<SessionAttempt[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("test");
  const [isWordListExpanded, setIsWordListExpanded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

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
    const storedUserId = window.localStorage.getItem(STORAGE_KEY) ?? "";
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme) {
      setIsDarkMode(storedTheme === "dark");
    } else {
      setIsDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    if (storedUserId) {
      setUserId(storedUserId);
      setUserIdInput(storedUserId);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    async function loadWords() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchJson<{ words: StressWord[] }>(
          `/api/words?userId=${encodeURIComponent(userId)}`,
          { method: "GET" },
        );
        setWords(result.words);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити слова.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadWords();
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

  function finishTest(forceAttempts?: SessionAttempt[]) {
    const attempts = forceAttempts ?? activeTest?.sessionAttempts ?? [];
    setLastSession(attempts);
    setActiveTest(null);
  }

  function startTest(mode: TestMode) {
    if (words.length === 0) {
      setError("Спочатку додайте хоча б одне слово.");
      return;
    }

    const queue = mode === "random" ? shuffleWords(words) : buildLearningQueue(words);

    setLastSession([]);
    setActiveTest({
      mode,
      queue,
      index: 0,
      selectedVowelIndex: null,
      answered: false,
      sessionAttempts: [],
    });
    setMessage(null);
    setError(null);
  }

  async function handleSaveUserId(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextUserId = userIdInput.trim();

    if (!nextUserId) {
      setError("Введіть свій ідентифікатор.");
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, nextUserId);
    setUserId(nextUserId);
    setActiveTest(null);
    setLastSession([]);
    resetFlashMessages();
  }

  function handleChangeUser() {
    window.localStorage.removeItem(STORAGE_KEY);
    setUserId("");
    setWords([]);
    setWordInput("");
    setBulkInput("");
    setEditingWordId(null);
    setActiveTest(null);
    setLastSession([]);
    setMessage(null);
    setError(null);
  }

  async function handleWordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
      return;
    }

    setIsSavingWord(true);
    resetFlashMessages();

    try {
      const endpoint = editingWordId ? `/api/words/${editingWordId}` : "/api/words";
      const method = editingWordId ? "PATCH" : "POST";

      const result = await fetchJson<{ word: StressWord }>(endpoint, {
        method,
        body: JSON.stringify({ userId, word: wordInput }),
      });

      setWords((currentWords) => upsertWord(currentWords, result.word));
      setWordInput("");
      setEditingWordId(null);
      setMessage(
        editingWordId
          ? "Слово успішно оновлено."
          : "Слово успішно додано.",
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
    if (!userId) {
      return;
    }

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
    if (!userId) {
      return;
    }

    resetFlashMessages();

    try {
      await fetchJson<{ success: true }>(
        `/api/words/${wordId}?userId=${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
        },
      );

      setWords((currentWords) => currentWords.filter((word) => word.id !== wordId));

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

  async function handleAnswer(word: StressWord, chosenIndex: number) {
    if (!userId || !activeTest || activeTest.answered || isSubmittingAttempt) {
      return;
    }

    const isCorrect = isCorrectStressPick(word.stressPositions, chosenIndex);
    const nextAttempt: SessionAttempt = {
      wordId: word.id,
      word: word.displayWord,
      sourceText: word.sourceText,
      chosenIndex,
      correctPositions: word.stressPositions,
      isCorrect,
    };

    setIsSubmittingAttempt(true);
    resetFlashMessages();

    try {
      const result = await fetchJson<{ word: StressWord }>("/api/test-attempts", {
        method: "POST",
        body: JSON.stringify({
          userId,
          wordId: word.id,
          chosenIndex,
          isCorrect,
        }),
      });

      setWords((currentWords) => upsertWord(currentWords, result.word));
      setActiveTest((currentTest) =>
        currentTest
          ? {
              ...currentTest,
              selectedVowelIndex: chosenIndex,
              answered: true,
              sessionAttempts: [...currentTest.sessionAttempts, nextAttempt],
              queue: currentTest.queue.map((item) =>
                item.id === result.word.id ? result.word : item,
              ),
            }
          : currentTest,
      );
    } catch (attemptError) {
      setError(
        attemptError instanceof Error
          ? attemptError.message
          : "Не вдалося зберегти результат відповіді.",
      );
    } finally {
      setIsSubmittingAttempt(false);
    }
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

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className={`${cardClass} w-full max-w-sm p-8`}>
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
              Наголоси
            </h1>
            <button
              type="button"
              onClick={() => setIsDarkMode((v) => !v)}
              className={`${btnSecondary} px-2.5 py-2.5`}
              aria-label={isDarkMode ? "Світла тема" : "Темна тема"}
            >
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>

          <form className="mt-8 space-y-3" onSubmit={handleSaveUserId}>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-widest text-(--muted)">
                Ваш ID
              </span>
              <input
                value={userIdInput}
                onChange={(event) => setUserIdInput(event.target.value)}
                className={inputClass}
                placeholder="наприклад: yaroslav"
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            ) : null}

            <button type="submit" className={`${btnPrimary} w-full`}>
              Увійти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8 sm:px-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
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
            <button type="button" onClick={handleChangeUser} className={btnSecondary}>
              Змінити ID
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatsBadge label="Слова" value={words.length} />
          <StatsBadge label="Нові" value={totalNeverTested} />
          <StatsBadge label="Відповіді" value={totalAttempts} />
        </div>

        {/* Flash messages */}
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

        {/* Tabs */}
        <div className="flex gap-1 border-b border-(--card-border)">
          <TabButton isActive={activeTab === "test"} onClick={() => setActiveTab("test")}>
            Тестування
          </TabButton>
          <TabButton isActive={activeTab === "manage"} onClick={() => setActiveTab("manage")}>
            Керування словами
          </TabButton>
        </div>

        {activeTab === "test" ? (
          <section className="space-y-5">
            {/* Start buttons */}
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

            {/* Active test card */}
            {activeTest && currentWord ? (
              <div
                className={`${cardClass} p-6 transition ${
                  activeTest.answered ? "cursor-pointer" : ""
                }`}
                onClick={handleAdvance}
                role={activeTest.answered ? "button" : undefined}
                tabIndex={activeTest.answered ? 0 : -1}
                onKeyDown={(event) => {
                  if (
                    activeTest.answered &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    handleAdvance();
                  }
                }}
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

                {/* Word display */}
                <div className="mt-10 flex justify-center">
                  <div className="flex flex-wrap items-baseline justify-center gap-1 text-4xl font-semibold sm:text-5xl">
                    {[...currentWord.displayWord].map((character, index) => {
                      const isVowel = isUkrainianVowel(character);
                      const isCorrect = currentWord.stressPositions.includes(index);
                      const isSelected = activeTest.selectedVowelIndex === index;

                      let className =
                        "rounded-lg px-1.5 py-1 transition font-display tracking-tight";

                      if (!isVowel) {
                        className += " text-foreground cursor-default";
                      } else if (!activeTest.answered) {
                        className +=
                          " cursor-pointer border border-(--card-border) text-foreground hover:border-[var(--foreground)] hover:bg-background";
                      } else if (isCorrect) {
                        className += " bg-emerald-500 text-white border border-emerald-500";
                      } else if (isSelected) {
                        className += " bg-rose-500 text-white border border-rose-500";
                      } else {
                        className +=
                          " border border-(--card-border) text-(--muted)";
                      }

                      return (
                        <button
                          key={`${character}-${index}`}
                          type="button"
                          disabled={!isVowel || activeTest.answered || isSubmittingAttempt}
                          className={className}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isVowel) return;
                            void handleAnswer(currentWord, index);
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

                {/* Feedback */}
                {activeTest.answered ? (
                  <div className="mt-8 border-t border-(--card-border) pt-5">
                    <p
                      className={`text-sm font-medium ${
                        activeTest.selectedVowelIndex !== null &&
                        currentWord.stressPositions.includes(activeTest.selectedVowelIndex)
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {activeTest.selectedVowelIndex !== null &&
                      currentWord.stressPositions.includes(activeTest.selectedVowelIndex)
                        ? "Правильно!"
                        : `Неправильно. Правильний варіант: ${formatSourceTextWithStress(
                            currentWord.sourceText,
                            currentWord.displayWord,
                            currentWord.stressPositions,
                          )}`}
                    </p>
                  </div>
                ) : isSubmittingAttempt ? (
                  <p className="mt-8 text-xs text-(--muted)">
                    Зберігаємо...
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Session results */}
            {!activeTest && sessionSummary.total > 0 ? (
              <div className={`${cardClass} p-6`}>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  Результати
                </h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <StatsBadge label="Усього" value={sessionSummary.total} />
                  <StatsBadge label="Правильно" value={sessionSummary.correct} />
                  <StatsBadge label="Помилок" value={sessionSummary.incorrect} />
                </div>

                <div className="mt-5 space-y-2">
                  {sessionSummary.attempts.map((attempt, index) => (
                    <div
                      key={`${attempt.wordId}-${index}`}
                      className="flex items-center justify-between gap-4 rounded-xl border border-(--card-border) bg-background px-4 py-2.5"
                    >
                      <p className="font-display text-lg font-medium text-foreground">
                        {formatSourceTextWithStress(
                          attempt.sourceText,
                          attempt.word,
                          attempt.correctPositions,
                        )}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          attempt.isCorrect
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                        }`}
                      >
                        {attempt.isCorrect ? "Правильно" : "Помилка"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="space-y-5">
            {/* Word form */}
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
                  <button type="submit" disabled={isSavingWord} className={btnPrimary}>
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
                <p className="mt-2 text-xs leading-5 text-(--muted)">
                  По одному слову в рядок або через кому. Якщо слово має два
                  наголоси, позначте обидві голосні великими літерами. Усе після
                  першого слова можна використовувати як примітку.
                </p>
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

            {/* Word list */}
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
                  {isWordListExpanded ? "Сховати" : `Показати (${words.length})`}
                </button>
              </div>

              {isWordListExpanded ? (
                <div className="mt-5">
                  {isLoading ? (
                    <p className="text-sm text-(--muted)">Завантаження...</p>
                  ) : words.length === 0 ? (
                    <p className="text-sm text-(--muted)">
                      Поки що немає слів. Додайте перше слово вручну або через імпорт.
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
        )}
      </div>
    </div>
  );
}
