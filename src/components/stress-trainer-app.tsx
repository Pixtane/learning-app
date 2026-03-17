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
    <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/70">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
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
      className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
        isActive
          ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10 dark:bg-blue-500 dark:text-slate-950 dark:shadow-blue-500/20"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

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

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#dbeafe_0%,#eef2ff_45%,#f8fafc_100%)] px-4 py-10 dark:bg-[radial-gradient(circle_at_top,#0f172a_0%,#111827_45%,#020617_100%)]">
        <div className="w-full max-w-md rounded-4xl border border-white/70 bg-white/85 p-8 shadow-2xl shadow-slate-200/80 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/85 dark:shadow-slate-950/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
                Learning App
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                Наголоси
              </h1>
            </div>

            <button
              type="button"
              onClick={() => setIsDarkMode((currentValue) => !currentValue)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isDarkMode ? "Світла тема" : "Темна тема"}
            </button>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Введіть свій ідентифікатор. Він буде збережений у локальному сховищі
            браузера та використаний як простий логін.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSaveUserId}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Ваш ID
              </span>
              <input
                value={userIdInput}
                onChange={(event) => setUserIdInput(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-0 transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500"
                placeholder="наприклад: yaroslav"
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/80 dark:bg-rose-950/60 dark:text-rose-200">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-blue-500 dark:text-slate-950 dark:hover:bg-blue-400"
            >
              Увійти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0%,#eff6ff_30%,#f8fafc_100%)] pb-16 dark:bg-[radial-gradient(circle_at_top,#0f172a_0%,#111827_35%,#020617_100%)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-4xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/70 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-slate-950/50">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                Режим навчання
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100 sm:text-4xl">
                Наголоси
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                Додавайте слова з наголошеними голосними великими літерами,
                тренуйтеся у випадковому або навчальному режимі та зберігайте всі
                результати у Postgres через Neon.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-slate-950 dark:text-slate-100">
                ID: {userId}
              </div>
              <button
                type="button"
                onClick={() => setIsDarkMode((currentValue) => !currentValue)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {isDarkMode ? "Світла тема" : "Темна тема"}
              </button>
              <button
                type="button"
                onClick={handleChangeUser}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Змінити ID
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatsBadge label="Слів у базі" value={words.length} />
            <StatsBadge label="Ніколи не тестувались" value={totalNeverTested} />
            <StatsBadge label="Усього відповідей" value={totalAttempts} />
          </div>
        </section>

        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-4xl border border-white/70 bg-white/80 p-3 shadow-xl shadow-slate-200/70 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-slate-950/50">
          <div className="flex flex-wrap gap-3">
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
          </div>
        </section>

        {activeTab === "test" ? (
          <section className="space-y-6">
            <div className="rounded-4xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/70 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-slate-950/50">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Тестування
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                У випадковому режимі слова перемішуються. У навчальному режимі
                спочатку йдуть нові слова, потім найдавніші помилки, а тоді
                найдавніші правильні відповіді.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => startTest("random")}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800"
                >
                  Випадковий режим
                </button>
                <button
                  type="button"
                  onClick={() => startTest("learning")}
                  className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 dark:bg-blue-500 dark:text-slate-950 dark:hover:bg-blue-400"
                >
                  Навчальний режим
                </button>
              </div>
            </div>

            {activeTest && currentWord ? (
              <div
                className={`rounded-4xl border p-6 shadow-xl backdrop-blur transition ${
                  activeTest.answered
                    ? "cursor-pointer border-blue-200 bg-blue-50/90 shadow-blue-100/70 dark:border-blue-700/60 dark:bg-blue-950/40 dark:shadow-blue-950/40"
                    : "border-white/70 bg-white/80 shadow-slate-200/70 dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-slate-950/50"
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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
                      {activeTest.mode === "random"
                        ? "Випадковий режим"
                        : "Навчальний режим"}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                      Слово {activeTest.index + 1} з {activeTest.queue.length}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      finishTest(activeTest.sessionAttempts);
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Завершити тест
                  </button>
                </div>

                <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">
                  Натисніть на голосну в першому слові. Додатковий текст показано
                  лише як підказку і він не натискається.
                </p>

                <div className="mt-8 flex justify-center">
                  <div className="rounded-4xl bg-white px-4 py-5 shadow-inner shadow-slate-100 dark:bg-slate-950 dark:shadow-slate-950/60">
                    <div className="flex flex-wrap items-center justify-center gap-2 text-3xl font-semibold sm:text-4xl">
                      {[...currentWord.displayWord].map((character, index) => {
                        const isVowel = isUkrainianVowel(character);
                        const isCorrect = currentWord.stressPositions.includes(index);
                        const isSelected = activeTest.selectedVowelIndex === index;

                        let className =
                          "min-w-10 rounded-2xl px-2 py-3 transition sm:min-w-12 sm:px-3";

                        if (!isVowel) {
                          className += " text-slate-900 dark:text-slate-100";
                        } else if (!activeTest.answered) {
                          className +=
                            " cursor-pointer bg-slate-100 text-slate-900 hover:bg-blue-100 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";
                        } else if (isCorrect) {
                          className += " bg-emerald-500 text-white";
                        } else if (isSelected) {
                          className += " bg-rose-500 text-white";
                        } else {
                          className +=
                            " bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                        }

                        return (
                          <button
                            key={`${character}-${index}`}
                            type="button"
                            disabled={!isVowel || activeTest.answered || isSubmittingAttempt}
                            className={className}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!isVowel) {
                                return;
                              }
                              void handleAnswer(currentWord, index);
                            }}
                          >
                            {character}
                          </button>
                        );
                      })}

                      {currentWordTrailingText ? (
                        <span className="ml-2 text-lg font-medium text-slate-500 dark:text-slate-400 sm:text-xl">
                          {currentWordTrailingText}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {activeTest.answered ? (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-950">
                    <p
                      className={`text-base font-semibold ${
                        activeTest.selectedVowelIndex !== null &&
                        currentWord.stressPositions.includes(
                          activeTest.selectedVowelIndex,
                        )
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-rose-700 dark:text-rose-400"
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
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      Натисніть на картку, Enter або пробіл, щоб перейти до
                      наступного слова.
                    </p>
                  </div>
                ) : isSubmittingAttempt ? (
                  <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                    Зберігаємо результат...
                  </p>
                ) : null}
              </div>
            ) : null}

            {!activeTest && sessionSummary.total > 0 ? (
              <div className="rounded-4xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/70 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-slate-950/50">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Результати останнього тесту
                </h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <StatsBadge label="Усього" value={sessionSummary.total} />
                  <StatsBadge label="Правильно" value={sessionSummary.correct} />
                  <StatsBadge label="Помилок" value={sessionSummary.incorrect} />
                </div>

                <div className="mt-6 space-y-3">
                  {sessionSummary.attempts.map((attempt, index) => (
                    <div
                      key={`${attempt.wordId}-${index}`}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-950"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {formatSourceTextWithStress(
                            attempt.sourceText,
                            attempt.word,
                            attempt.correctPositions,
                          )}
                        </p>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            attempt.isCorrect
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                          }`}
                        >
                          {attempt.isCorrect ? "Правильно" : "Помилка"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-4xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm leading-6 text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                Після завершення тесту тут з&apos;являться результати поточної
                сесії.
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-6">
            <div className="rounded-4xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/70 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-slate-950/50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    Керування словами
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Приклад запису: <span className="font-semibold">завдАння</span>{" "}
                    або <span className="font-semibold">хАос (у міфології: стихія)</span>.
                  </p>
                </div>
              </div>

              <form className="mt-5 space-y-4" onSubmit={handleWordSubmit}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    {editingWordId ? "Редагувати слово" : "Нове слово"}
                  </span>
                  <input
                    value={wordInput}
                    onChange={(event) => setWordInput(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500"
                    placeholder="вИпадок"
                  />
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={isSavingWord}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950 dark:hover:bg-slate-800"
                  >
                    {isSavingWord
                      ? "Зберігаємо..."
                      : editingWordId
                        ? "Оновити слово"
                        : "Додати слово"}
                  </button>

                  {editingWordId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWordId(null);
                        setWordInput("");
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Скасувати редагування
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="mt-8">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Масовий імпорт
                  </span>
                  <textarea
                    value={bulkInput}
                    onChange={(event) => setBulkInput(event.target.value)}
                    className="min-h-40 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500"
                    placeholder={"вИпадок\nзАвжди\nводопровІд\nперепИс"}
                  />
                </label>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  По одному слову в рядок або через кому. Якщо слово має два
                  наголоси, позначте обидві голосні великими літерами. Усе після
                  першого слова можна використовувати як примітку.
                </p>
                <button
                  type="button"
                  onClick={handleImportWords}
                  disabled={isImporting}
                  className="mt-4 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:text-slate-950 dark:hover:bg-blue-400"
                >
                  {isImporting ? "Імпортуємо..." : "Імпортувати слова"}
                </button>
              </div>
            </div>

            <div className="rounded-4xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/70 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-slate-950/50">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    Список слів
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Список прихований за замовчуванням, щоб не заважати на мобільному.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWordListExpanded((currentValue) => !currentValue)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {isWordListExpanded ? "Сховати список" : `Показати список (${words.length})`}
                </button>
              </div>

              <div className="mt-5">
                {isLoading ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Завантаження...
                  </p>
                ) : null}

                {!isWordListExpanded ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
                    Список слів приховано. Відкрийте його лише коли потрібно
                    редагувати або переглядати записи.
                  </div>
                ) : words.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
                    Поки що немає слів. Додайте перше слово вручну або через
                    імпорт.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {words.map((word) => (
                      <div
                        key={word.id}
                        className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                              {formatSourceTextWithStress(
                                word.sourceText,
                                word.displayWord,
                                word.stressPositions,
                              )}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                                Спроб: {word.progress.attemptsCount}
                              </span>
                              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                Правильно: {word.progress.correctCount}
                              </span>
                              <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                                Помилок: {word.progress.incorrectCount}
                              </span>
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                                Остання відповідь:{" "}
                                {word.progress.lastResult === null
                                  ? "не було"
                                  : word.progress.lastResult
                                    ? "правильна"
                                    : "неправильна"}
                              </span>
                            </div>
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                              Остання перевірка:{" "}
                              {formatDate(word.progress.lastAnsweredAt)}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditWord(word)}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Редагувати
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWord(word.id)}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950"
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
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
