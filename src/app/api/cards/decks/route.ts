import { NextRequest } from "next/server";

import { createDeckForUser, listDecksForUser } from "@/lib/db";

function getUserId(searchParams: URLSearchParams) {
  return searchParams.get("userId")?.trim() ?? "";
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request.nextUrl.searchParams);

  if (!userId) {
    return Response.json(
      { error: "Потрібно вказати ідентифікатор користувача." },
      { status: 400 },
    );
  }

  try {
    const decks = await listDecksForUser(userId);
    return Response.json({ decks });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося отримати список колод.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; name?: string };
    const userId = body.userId?.trim() ?? "";
    const name = body.name?.trim() ?? "";

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const deck = await createDeckForUser(userId, name);
    return Response.json({ deck });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося зберегти колоду.",
      },
      { status: 400 },
    );
  }
}
