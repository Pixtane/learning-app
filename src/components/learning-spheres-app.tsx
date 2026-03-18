"use client";

import Link from "next/link";
import { useState } from "react";

import {
  getCookieValue,
  setCookieValue,
} from "@/lib/client-cookies";

const cardClass = "rounded-2xl border border-(--card-border) bg-(--card)";
const btnPrimary =
  "rounded-xl bg-(--accent) px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-80";
const btnSecondary =
  "rounded-xl border border-(--card-border) bg-(--card) px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-[var(--foreground)]";
const inputClass =
  "w-full rounded-xl border border-(--card-border) bg-background px-4 py-3 text-foreground outline-none transition focus:border-[var(--foreground)] placeholder:text-(--muted)";

const USER_ID_COOKIE_KEY = "learning-app-user-id";

export function LearningSpheresApp() {
  const [savedUserId, setSavedUserId] = useState<string | null>(() => {
    const existing = getCookieValue(USER_ID_COOKIE_KEY);
    return existing?.trim() ? existing.trim() : null;
  });
  const [userIdInput, setUserIdInput] = useState(() => savedUserId ?? "");
  const [isDialogOpen, setIsDialogOpen] = useState(() => !savedUserId);
  const [error, setError] = useState<string | null>(null);

  function generateRandomId() {
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    let output = "";
    for (let index = 0; index < 6; index += 1) {
      output += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return output;
  }

  function openIdDialog() {
    setUserIdInput(savedUserId ?? "");
    setError(null);
    setIsDialogOpen(true);
  }

  function closeIdDialog() {
    if (!savedUserId) {
      const generatedId = generateRandomId();
      setCookieValue(USER_ID_COOKIE_KEY, generatedId);
      setSavedUserId(generatedId);
      setUserIdInput(generatedId);
    }
    setError(null);
    setIsDialogOpen(false);
  }

  function handleSaveId(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextUserId = userIdInput.trim();

    if (!nextUserId) {
      setError("Введіть свій ідентифікатор.");
      return;
    }

    setCookieValue(USER_ID_COOKIE_KEY, nextUserId);
    setSavedUserId(nextUserId);
    setError(null);
    setIsDialogOpen(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className={`${cardClass} w-full max-w-3xl p-8`}>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Learning Spheres
          </h1>
          <button type="button" onClick={openIdDialog} className={btnSecondary}>
            {savedUserId ?? "id"}
          </button>
        </div>
        <p className="mt-2 text-sm text-(--muted)">
          Оберіть тренажер: наголоси або картки.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/stress" className={`${btnPrimary} w-full py-6 text-center text-base`}>
            Сфера Наголосів
          </Link>
          <Link href="/cards" className={`${btnSecondary} w-full py-6 text-center text-base`}>
            Сфера Карток
          </Link>
        </div>
      </div>

      {isDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className={`${cardClass} w-full max-w-md p-6`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold text-foreground">
                ID користувача
              </h2>
              <button type="button" onClick={closeIdDialog} className={btnSecondary}>
                Закрити
              </button>
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleSaveId}>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-widest text-(--muted)">
                  ID для всієї апки
                </span>
                <input
                  value={userIdInput}
                  onChange={(event) => setUserIdInput(event.target.value)}
                  className={inputClass}
                  placeholder="наприклад: yaroslav"
                  autoFocus
                />
              </label>

              {error ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-3">
                <button type="submit" className={btnPrimary}>
                  Зберегти ID
                </button>
                <button type="button" onClick={closeIdDialog} className={btnSecondary}>
                  Скасувати
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
