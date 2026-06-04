import { NextRequest } from "next/server";

import { getDateStatsForUser } from "@/lib/db";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";

  if (!userId) {
    return Response.json(
      { error: "Потрібно вказати ідентифікатор користувача." },
      { status: 400 },
    );
  }

  try {
    const stats = await getDateStatsForUser(userId);
    return Response.json(stats);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося завантажити статистику.",
      },
      { status: 500 },
    );
  }
}
