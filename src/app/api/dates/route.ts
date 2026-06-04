import { NextRequest } from "next/server";

import { listDatesForUser } from "@/lib/db";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";

  if (!userId) {
    return Response.json(
      { error: "Потрібно вказати ідентифікатор користувача." },
      { status: 400 },
    );
  }

  try {
    const dates = await listDatesForUser(userId);
    return Response.json({ dates });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося завантажити дати.",
      },
      { status: 500 },
    );
  }
}
