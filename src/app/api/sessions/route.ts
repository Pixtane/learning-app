import { NextRequest } from "next/server";

import { listTestSessionsForUser, saveTestSessionForUser } from "@/lib/db";
import type { SessionAttempt } from "@/lib/types";

function sanitizeAttempts(value: unknown): SessionAttempt[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      return {
        itemId: Number(raw.itemId),
        prompt: String(raw.prompt ?? ""),
        answer: String(raw.answer ?? ""),
        chosen: String(raw.chosen ?? ""),
        isCorrect: Boolean(raw.isCorrect),
      } satisfies SessionAttempt;
    })
    .filter(
      (item): item is SessionAttempt =>
        item !== null &&
        Number.isFinite(item.itemId) &&
        item.prompt.length > 0 &&
        item.answer.length > 0,
    );
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";
  const sphereParam = request.nextUrl.searchParams.get("sphere");
  const sphere =
    sphereParam === "stress" || sphereParam === "cards" ? sphereParam : undefined;

  if (!userId) {
    return Response.json(
      { error: "Потрібно вказати ідентифікатор користувача." },
      { status: 400 },
    );
  }

  try {
    const sessions = await listTestSessionsForUser(userId, sphere);
    return Response.json({ sessions });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося завантажити сесії.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      sphere?: "stress" | "cards";
      title?: string;
      mode?: string | null;
      startedAt?: string;
      finishedAt?: string;
      attempts?: unknown;
    };

    const userId = body.userId?.trim() ?? "";
    const sphere = body.sphere;
    const title = body.title?.trim() ?? "";

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    if (sphere !== "stress" && sphere !== "cards") {
      return Response.json({ error: "Некоректна сфера тестування." }, { status: 400 });
    }

    if (!title) {
      return Response.json({ error: "Потрібно вказати назву сесії." }, { status: 400 });
    }

    const attempts = sanitizeAttempts(body.attempts);

    if (attempts.length === 0) {
      return Response.json(
        { error: "Сесія має містити хоча б одну відповідь." },
        { status: 400 },
      );
    }

    const session = await saveTestSessionForUser({
      userId,
      sphere,
      title,
      mode: body.mode ?? null,
      startedAt: body.startedAt,
      finishedAt: body.finishedAt,
      attempts,
    });

    return Response.json({ session });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося зберегти сесію.",
      },
      { status: 400 },
    );
  }
}
