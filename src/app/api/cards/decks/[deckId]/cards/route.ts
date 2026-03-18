import { NextRequest } from "next/server";

import { createCardForUser, listCardsForDeckForUser, listDueCardsForDeckForUser } from "@/lib/db";

function parseDeckId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ deckId: string }> },
) {
  const { deckId: deckIdParam } = await context.params;
  const deckId = parseDeckId(deckIdParam);
  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";
  const dueOnly = request.nextUrl.searchParams.get("dueOnly") === "true";

  if (!deckId) {
    return Response.json({ error: "Некоректний ідентифікатор колоди." }, { status: 400 });
  }

  if (!userId) {
    return Response.json(
      { error: "Потрібно вказати ідентифікатор користувача." },
      { status: 400 },
    );
  }

  try {
    const cards = dueOnly
      ? await listDueCardsForDeckForUser(userId, deckId, true)
      : await listCardsForDeckForUser(userId, deckId);
    return Response.json({ cards });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося отримати список карток.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  try {
    const { deckId: deckIdParam } = await context.params;
    const deckId = parseDeckId(deckIdParam);
    const body = (await request.json()) as {
      userId?: string;
      front?: string;
      back?: string;
    };
    const userId = body.userId?.trim() ?? "";
    const front = body.front?.trim() ?? "";
    const back = body.back?.trim() ?? "";

    if (!deckId) {
      return Response.json({ error: "Некоректний ідентифікатор колоди." }, { status: 400 });
    }

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const card = await createCardForUser({ userId, deckId, front, back });
    return Response.json({ card });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося зберегти картку.",
      },
      { status: 400 },
    );
  }
}
