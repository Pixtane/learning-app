"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { displayDateText } from "@/lib/dates";
import { getCookieValue, setCookieValue } from "@/lib/client-cookies";
import type {
  DateDailyTrend,
  DatePerDateStat,
  DateStatsSummary,
  HistoryDate,
} from "@/lib/types";
import { SunIcon, MoonIcon } from "./icons";

type ActiveTab = "study" | "list" | "stats";
type ListFilter = "all" | "strong" | "non-strong";
type StudyPhase = "card" | "association";

type QuestionSnapshot = {
  phase: StudyPhase;
  flipped: boolean;
  isCorrect: boolean | null;
  distractors: HistoryDate[];
  checkedAssociationIds: number[];
  associationDone: boolean;
};

type ActiveStudy = {
  queue: HistoryDate[];
  currentIndex: number;
  viewIndex: number;
  snapshots: QuestionSnapshot[];
  startedAt: string;
};

function createInitialSnapshot(): QuestionSnapshot {
  return {
    phase: "card",
    flipped: false,
    isCorrect: null,
    distractors: [],
    checkedAssociationIds: [],
    associationDone: false,
  };
}

function getSnapshot(study: ActiveStudy, index: number): QuestionSnapshot {
  return study.snapshots[index] ?? createInitialSnapshot();
}

function setSnapshot(
  study: ActiveStudy,
  index: number,
  patch: Partial<QuestionSnapshot>,
): ActiveStudy {
  const snapshots = [...study.snapshots];
  snapshots[index] = { ...getSnapshot(study, index), ...patch };
  return { ...study, snapshots };
}

type FailedSave =
  | { kind: "answer"; dateId: number; isCorrect: boolean }
  | { kind: "association"; dateId: number; associationIds: number[] };

const THEME_COOKIE_KEY = "learning-app-theme";
const cardClass = "rounded-2xl border border-(--card-border) bg-(--card)";
const inputClass =
  "w-full rounded-xl border border-(--card-border) bg-background px-4 py-3 text-foreground outline-none transition focus:border-[var(--foreground)] placeholder:text-(--muted)";
const btnPrimary =
  "rounded-xl bg-(--accent) px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-80 disabled:opacity-40";
const btnSecondary =
  "rounded-xl border border-(--card-border) bg-(--card) px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-[var(--foreground)]";

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

function getLearningPriority(date: HistoryDate) {
  if (date.progress.attemptsCount === 0) {
    return 0;
  }

  if (date.progress.lastResult === false) {
    return 1;
  }

  return 2;
}

function shuffleDates(queue: HistoryDate[]) {
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

function buildLearningQueue(dates: HistoryDate[]) {
  const neverTested = shuffleDates(
    dates.filter((date) => getLearningPriority(date) === 0),
  );
  const wrong = dates
    .filter((date) => getLearningPriority(date) === 1)
    .sort((left, right) => {
      const leftDate =
        left.progress.lastAnsweredAt ?? "9999-12-31T00:00:00.000Z";
      const rightDate =
        right.progress.lastAnsweredAt ?? "9999-12-31T00:00:00.000Z";
      return leftDate.localeCompare(rightDate);
    });
  const reviewed = dates
    .filter((date) => getLearningPriority(date) === 2)
    .sort((left, right) => {
      const leftDate =
        left.progress.lastAnsweredAt ?? "9999-12-31T00:00:00.000Z";
      const rightDate =
        right.progress.lastAnsweredAt ?? "9999-12-31T00:00:00.000Z";
      return leftDate.localeCompare(rightDate);
    });

  return [...neverTested, ...wrong, ...reviewed];
}

function pickDistractors(dates: HistoryDate[], current: HistoryDate) {
  const pool = dates.filter(
    (date) => !date.isStrong && date.id !== current.id,
  );
  return shuffleDates(pool).slice(0, 3);
}

function getStudyQueueDates(dates: HistoryDate[]) {
  return dates.filter((date) => date.isStrong);
}

function upsertDate(dates: HistoryDate[], next: HistoryDate) {
  return dates.map((date) => (date.id === next.id ? next : date));
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

export function DatesTrainerApp({ userId }: { userId: string }) {
  const [dates, setDates] = useState<HistoryDate[]>([]);
  const [stats, setStats] = useState<{
    summary: DateStatsSummary;
    dailyTrend: DateDailyTrend[];
    perDate: DatePerDateStat[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("study");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [activeStudy, setActiveStudy] = useState<ActiveStudy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [failedSaves, setFailedSaves] = useState<FailedSave[]>([]);
  const [showSyncToast, setShowSyncToast] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewIndex = activeStudy?.viewIndex ?? 0;
  const currentIndex = activeStudy?.currentIndex ?? 0;
  const viewSnapshot = activeStudy
    ? getSnapshot(activeStudy, viewIndex)
    : null;
  const viewedDate = activeStudy?.queue[viewIndex] ?? null;
  const isReviewing = activeStudy !== null && viewIndex < currentIndex;

  const filteredDates = useMemo(() => {
    if (listFilter === "strong") {
      return dates.filter((date) => date.isStrong);
    }

    if (listFilter === "non-strong") {
      return dates.filter((date) => !date.isStrong);
    }

    return dates;
  }, [dates, listFilter]);

  const allAssociationsChecked =
    viewSnapshot !== null &&
    viewSnapshot.phase === "association" &&
    viewSnapshot.distractors.length === 3 &&
    viewSnapshot.distractors.every((date) =>
      viewSnapshot.checkedAssociationIds.includes(date.id),
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
    if (failedSaves.length > 0) {
      setShowSyncToast(true);
      return;
    }

    if (pendingSaves > 0) {
      const timer = window.setTimeout(() => setShowSyncToast(true), 350);
      return () => window.clearTimeout(timer);
    }

    setShowSyncToast(false);
  }, [failedSaves.length, pendingSaves]);

  useEffect(() => {
    async function loadDates() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchJson<{ dates: HistoryDate[] }>(
          `/api/dates?userId=${encodeURIComponent(userId)}`,
          { method: "GET" },
        );
        setDates(result.dates);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити дати.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadDates();
  }, [userId]);

  useEffect(() => {
    if (activeTab !== "stats") {
      return;
    }

    async function loadStats() {
      setError(null);

      try {
        const result = await fetchJson<{
          summary: DateStatsSummary;
          dailyTrend: DateDailyTrend[];
          perDate: DatePerDateStat[];
        }>(`/api/dates/stats?userId=${encodeURIComponent(userId)}`, {
          method: "GET",
        });
        setStats(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити статистику.",
        );
      }
    }

    void loadStats();
  }, [activeTab, userId]);

  function startStudy() {
    const strongDates = getStudyQueueDates(dates);

    if (strongDates.length === 0) {
      setError("Немає strong дат для навчання.");
      return;
    }

    setActiveStudy({
      queue: buildLearningQueue(strongDates),
      currentIndex: 0,
      viewIndex: 0,
      snapshots: [createInitialSnapshot()],
      startedAt: new Date().toISOString(),
    });
    setError(null);
  }

  function goToQuestion(study: ActiveStudy, index: number) {
    if (index < 0 || index > study.currentIndex) {
      return;
    }

    setActiveStudy({ ...study, viewIndex: index });
  }

  function advanceFromView(study: ActiveStudy) {
    if (study.viewIndex < study.currentIndex) {
      setActiveStudy({ ...study, viewIndex: study.viewIndex + 1 });
      return;
    }

    const snapshot = getSnapshot(study, study.currentIndex);
    if (!snapshot.associationDone) {
      return;
    }

    const nextIndex = study.currentIndex + 1;
    if (nextIndex >= study.queue.length) {
      setActiveStudy(null);
      return;
    }

    const snapshots = [...study.snapshots];
    if (!snapshots[nextIndex]) {
      snapshots[nextIndex] = createInitialSnapshot();
    }

    setActiveStudy({
      ...study,
      currentIndex: nextIndex,
      viewIndex: nextIndex,
      snapshots,
    });
  }

  async function enqueueSave(payload: FailedSave) {
    setPendingSaves((count) => count + 1);

    try {
      const body =
        payload.kind === "answer"
          ? {
              userId,
              dateId: payload.dateId,
              isCorrect: payload.isCorrect,
            }
          : {
              userId,
              dateId: payload.dateId,
              associationIds: payload.associationIds,
            };

      const result = await fetchJson<{ date: HistoryDate }>(
        "/api/dates/attempts",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );

      setDates((current) => upsertDate(current, result.date));
      setActiveStudy((current) =>
        current
          ? {
              ...current,
              queue: current.queue.map((date) =>
                date.id === result.date.id ? result.date : date,
              ),
            }
          : current,
      );
      setFailedSaves((current) =>
        current.filter(
          (item) => JSON.stringify(item) !== JSON.stringify(payload),
        ),
      );
    } catch {
      setFailedSaves((current) => [...current, payload]);
      setError(
        "Частину відповідей не вдалося зберегти. Можна продовжувати і повторити синхронізацію.",
      );
    } finally {
      setPendingSaves((count) => Math.max(0, count - 1));
    }
  }

  async function retryFailedSaves() {
    const pending = [...failedSaves];
    setFailedSaves([]);
    for (const payload of pending) {
      await enqueueSave(payload);
    }
  }

  function handleAnswer(isCorrect: boolean) {
    if (!activeStudy || !viewedDate || isReviewing) {
      return;
    }

    if (viewIndex !== currentIndex) {
      return;
    }

    const snapshot = getSnapshot(activeStudy, currentIndex);
    if (snapshot.phase !== "card") {
      return;
    }

    const optimistic: HistoryDate = {
      ...viewedDate,
      progress: {
        attemptsCount: viewedDate.progress.attemptsCount + 1,
        correctCount: viewedDate.progress.correctCount + (isCorrect ? 1 : 0),
        incorrectCount:
          viewedDate.progress.incorrectCount + (isCorrect ? 0 : 1),
        lastResult: isCorrect,
        lastAnsweredAt: new Date().toISOString(),
      },
    };

    setDates((current) => upsertDate(current, optimistic));

    const distractors = pickDistractors(dates, viewedDate);

    setActiveStudy((study) =>
      study
        ? {
            ...setSnapshot(study, currentIndex, {
              phase: "association",
              flipped: true,
              isCorrect,
              distractors,
              checkedAssociationIds: [],
              associationDone: false,
            }),
            queue: study.queue.map((date) =>
              date.id === optimistic.id ? optimistic : date,
            ),
          }
        : study,
    );

    void enqueueSave({
      kind: "answer",
      dateId: viewedDate.id,
      isCorrect,
    });
  }

  function handleAssociationNext() {
    if (!activeStudy || !viewedDate) {
      return;
    }

    if (isReviewing) {
      advanceFromView(activeStudy);
      return;
    }

    if (!allAssociationsChecked || viewIndex !== currentIndex) {
      return;
    }

    const snapshot = getSnapshot(activeStudy, currentIndex);
    const associationIds = snapshot.distractors.map((date) => date.id);

    void enqueueSave({
      kind: "association",
      dateId: viewedDate.id,
      associationIds,
    });

    const updated = setSnapshot(activeStudy, currentIndex, {
      associationDone: true,
    });
    advanceFromView(updated);
  }

  function toggleCardFace() {
    setActiveStudy((study) => {
      if (!study) {
        return study;
      }

      const snapshot = getSnapshot(study, study.viewIndex);
      return setSnapshot(study, study.viewIndex, {
        flipped: !snapshot.flipped,
      });
    });
  }

  function toggleAssociation(dateId: number) {
    if (isReviewing) {
      return;
    }

    setActiveStudy((study) => {
      if (!study || study.viewIndex !== study.currentIndex) {
        return study;
      }

      const snapshot = getSnapshot(study, study.viewIndex);
      if (snapshot.phase !== "association") {
        return study;
      }

      const checked = snapshot.checkedAssociationIds.includes(dateId)
        ? snapshot.checkedAssociationIds.filter((id) => id !== dateId)
        : [...snapshot.checkedAssociationIds, dateId];

      return setSnapshot(study, study.viewIndex, {
        checkedAssociationIds: checked,
      });
    });
  }

  function renderDateLabel(date: HistoryDate, strongAsBold = true) {
    const text = displayDateText(date.dateText);
    if (date.isStrong && strongAsBold) {
      return <strong>{text}</strong>;
    }
    return text;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className={`${cardClass} mx-auto w-full max-w-4xl p-6 sm:p-8`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href="/"
              className="text-sm text-(--muted) hover:text-foreground"
            >
              ← На головну
            </Link>
            <h1 className="mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">
              Сфера Дат
            </h1>
            <p className="mt-1 text-sm text-(--muted)">
              Каталог історичних дат · ID: {userId}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsDarkMode((value) => !value)}
            className={btnSecondary}
            aria-label="Перемкнути тему"
          >
            {isDarkMode ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
              Усього дат
            </p>
            <p className="mt-1 text-2xl font-display font-semibold text-foreground">
              {dates.length}
            </p>
          </div>
          <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
              Strong
            </p>
            <p className="mt-1 text-2xl font-display font-semibold text-foreground">
              {dates.filter((date) => date.isStrong).length}
            </p>
          </div>
          <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
              Без strong
            </p>
            <p className="mt-1 text-2xl font-display font-semibold text-foreground">
              {dates.filter((date) => !date.isStrong).length}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {showSyncToast ? (
          <div className="fixed right-4 bottom-4 z-50 w-[min(26rem,calc(100%-2rem))] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-lg dark:border-amber-900/50 dark:bg-amber-950/90 dark:text-amber-300">
            <div className="flex items-center justify-between gap-3">
              <p>
                Синхронізація: {pendingSaves} в роботі, {failedSaves.length}{" "}
                помилок.
              </p>
              {failedSaves.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void retryFailedSaves()}
                  className={btnSecondary}
                >
                  Повторити
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex gap-1 border-b border-(--card-border)">
          <TabButton
            isActive={activeTab === "study"}
            onClick={() => setActiveTab("study")}
          >
            Вчитися
          </TabButton>
          <TabButton
            isActive={activeTab === "list"}
            onClick={() => setActiveTab("list")}
          >
            Список
          </TabButton>
          <TabButton
            isActive={activeTab === "stats"}
            onClick={() => setActiveTab("stats")}
          >
            Статистика
          </TabButton>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-(--muted)">Завантаження…</p>
        ) : null}

        {activeTab === "study" ? (
          <section className="mt-6 space-y-5">
            {!activeStudy ? (
              <div className={`${cardClass} p-6`}>
                <p className="text-sm text-(--muted)">
                  Питання лише з strong дат ({getStudyQueueDates(dates).length}).
                  Після відповіді — три асоціації з дат без strong.
                </p>
                <button
                  type="button"
                  onClick={startStudy}
                  className={`${btnPrimary} mt-4`}
                  disabled={dates.length === 0}
                >
                  Почати навчання
                </button>
              </div>
            ) : viewedDate && viewSnapshot ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm text-(--muted)">
                  <span className="shrink-0">Питання</span>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: currentIndex + 1 }, (_, index) => {
                      const isViewing = index === viewIndex;
                      const isCurrent = index === currentIndex;
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => goToQuestion(activeStudy, index)}
                          className={`min-w-8 rounded-lg px-2 py-1 text-sm font-medium transition ${
                            isViewing
                              ? "bg-(--accent) text-background"
                              : "border border-(--card-border) bg-background text-foreground hover:border-foreground"
                          }`}
                          title={
                            isCurrent && !isViewing
                              ? "Поточне питання"
                              : undefined
                          }
                        >
                          {index + 1}
                          {isCurrent && !isViewing ? "•" : ""}
                        </button>
                      );
                    })}
                  </div>
                  <span>
                    {viewIndex + 1} з {activeStudy.queue.length} · #{viewedDate.ordinal}
                    {isReviewing ? " · перегляд" : ""}
                    {viewIndex === currentIndex && !isReviewing ? " · поточне" : ""}
                  </span>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={toggleCardFace}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleCardFace();
                    }
                  }}
                  className={`${cardClass} w-full cursor-pointer p-8 text-left transition select-text hover:border-foreground ${
                    viewedDate.isStrong ? "border-amber-400/60" : ""
                  }`}
                >
                  {!viewSnapshot.flipped ? (
                    <p className="text-lg leading-relaxed text-foreground">
                      {viewedDate.eventText}
                    </p>
                  ) : (
                    <p className="text-xl font-display font-semibold text-foreground">
                      {renderDateLabel(viewedDate)}
                    </p>
                  )}
                  <p className="mt-4 text-xs uppercase tracking-widest text-(--muted)">
                    {!viewSnapshot.flipped
                      ? "Натисніть, щоб показати дату"
                      : "Натисніть, щоб показати подію"}
                  </p>
                </div>

                {isReviewing ? (
                  <div className="space-y-4">
                    {viewSnapshot.phase === "association" ? (
                      <ul className="space-y-2">
                        {viewSnapshot.distractors.map((date) => (
                          <li
                            key={date.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-background px-4 py-3"
                          >
                            <span className="select-text text-sm text-foreground">
                              {renderDateLabel(date)} — {date.eventText}
                            </span>
                            <input
                              type="checkbox"
                              checked={viewSnapshot.checkedAssociationIds.includes(
                                date.id,
                              )}
                              readOnly
                              disabled
                              className="h-4 w-4 accent-(--accent)"
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleAssociationNext()}
                      className={btnPrimary}
                    >
                      Далі
                    </button>
                  </div>
                ) : viewSnapshot.phase === "card" ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleAnswer(true)}
                      className={btnPrimary}
                    >
                      Знаю
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAnswer(false)}
                      className={btnSecondary}
                    >
                      Не знаю
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveStudy(null)}
                      className={btnSecondary}
                    >
                      Зупинити
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-(--muted)">
                      Позначте всі три дати для асоціації (без strong):
                    </p>
                    <ul className="space-y-2">
                      {viewSnapshot.distractors.map((date) => {
                        const checked =
                          viewSnapshot.checkedAssociationIds.includes(date.id);
                        return (
                          <li
                            key={date.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-background px-4 py-3"
                          >
                            <span className="select-text text-sm text-foreground">
                              {renderDateLabel(date)} — {date.eventText}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAssociation(date.id)}
                              className="h-4 w-4 accent-(--accent)"
                            />
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleAssociationNext()}
                        className={btnPrimary}
                        disabled={!allAssociationsChecked}
                      >
                        Далі
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveStudy(null)}
                        className={btnSecondary}
                      >
                        Зупинити
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={`${cardClass} p-6`}>
                <p className="text-sm text-foreground">Сесію завершено.</p>
                <button
                  type="button"
                  onClick={startStudy}
                  className={`${btnPrimary} mt-4`}
                >
                  Почати знову
                </button>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "list" ? (
          <section className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Усі"],
                  ["strong", "Strong"],
                  ["non-strong", "Без strong"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setListFilter(value)}
                  className={listFilter === value ? btnPrimary : btnSecondary}
                >
                  {label}
                </button>
              ))}
            </div>

            <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
              {filteredDates.map((date) => (
                <li
                  key={date.id}
                  className={`rounded-xl border border-(--card-border) bg-background px-4 py-3 ${
                    date.isStrong ? "border-amber-400/40" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-(--muted)">#{date.ordinal}</p>
                      <p className="text-sm font-medium text-foreground">
                        {renderDateLabel(date)}
                      </p>
                      <p className="mt-1 text-sm text-(--muted)">
                        {date.eventText}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-(--muted)">
                      {date.progress.attemptsCount === 0 ? (
                        <span>ще не вчили</span>
                      ) : (
                        <>
                          <span>
                            {date.progress.lastResult ? "✓" : "✗"} ·{" "}
                            {date.progress.attemptsCount} спр.
                          </span>
                          <p className="mt-1">
                            {formatDate(date.progress.lastAnsweredAt)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {activeTab === "stats" && stats ? (
          <section className="mt-6 space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
                  Вивчено
                </p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {stats.summary.studiedCount} / {stats.summary.totalDates}
                </p>
              </div>
              <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
                  Точність загалом
                </p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {stats.summary.overallAccuracy}%
                </p>
              </div>
              <div className="rounded-xl border border-(--card-border) bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
                  Strong / без strong
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {stats.summary.strongAccuracy}% ({stats.summary.strongStudied}
                  ) · {stats.summary.nonStrongAccuracy}% (
                  {stats.summary.nonStrongStudied})
                </p>
              </div>
            </div>

            <div className={`${cardClass} p-5`}>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Тренд (останні дні)
              </h2>
              <ul className="mt-4 space-y-2">
                {stats.dailyTrend.length === 0 ? (
                  <li className="text-sm text-(--muted)">Ще немає спроб.</li>
                ) : (
                  stats.dailyTrend.map((day) => {
                    const accuracy =
                      day.attempts === 0
                        ? 0
                        : Math.round((day.correct / day.attempts) * 100);
                    return (
                      <li
                        key={day.date}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span className="w-24 shrink-0 text-(--muted)">
                          {day.date}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--card-border)">
                          <div
                            className="h-full rounded-full bg-(--accent)"
                            style={{ width: `${accuracy}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-foreground">
                          {accuracy}%
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            <details className={`${cardClass} p-5`}>
              <summary className="cursor-pointer font-display text-lg font-semibold text-foreground">
                Показати список дат
              </summary>
              <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {stats.perDate
                  .filter((row) => row.attemptsCount > 0)
                  .map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap justify-between gap-2 rounded-lg border border-(--card-border) bg-background px-3 py-2 text-sm"
                    >
                      <span>
                        #{row.ordinal}{" "}
                        {row.isStrong ? (
                          <strong>{displayDateText(row.dateText)}</strong>
                        ) : (
                          displayDateText(row.dateText)
                        )}
                      </span>
                      <span className="text-(--muted)">
                        {row.attemptsCount} спр. · {row.accuracy}% ·{" "}
                        {formatDate(row.lastAnsweredAt)}
                      </span>
                    </li>
                  ))}
              </ul>
            </details>
          </section>
        ) : null}
      </div>
    </div>
  );
}
