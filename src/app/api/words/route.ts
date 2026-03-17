import { NextRequest } from "next/server";

import { listWordsForUser, upsertWordForUser } from "@/lib/db";

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
    const words = await listWordsForUser(userId);
    return Response.json({ words });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося отримати список слів.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; word?: string };
    const userId = body.userId?.trim() ?? "";
    const word = body.word?.trim() ?? "";

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const savedWord = await upsertWordForUser(userId, word);
    return Response.json({ word: savedWord });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося зберегти слово.",
      },
      { status: 400 },
    );
  }
}
