import { deleteCardForUser, updateCardForUser } from "@/lib/db";

function parseCardId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  try {
    const { cardId: cardIdParam } = await context.params;
    const cardId = parseCardId(cardIdParam);
    const body = (await request.json()) as {
      userId?: string;
      front?: string;
      back?: string;
    };
    const userId = body.userId?.trim() ?? "";
    const front = body.front?.trim() ?? "";
    const back = body.back?.trim() ?? "";

    if (!cardId) {
      return Response.json({ error: "Некоректний ідентифікатор картки." }, { status: 400 });
    }

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const card = await updateCardForUser({ userId, cardId, front, back });
    return Response.json({ card });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося оновити картку.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  try {
    const { cardId: cardIdParam } = await context.params;
    const cardId = parseCardId(cardIdParam);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim() ?? "";

    if (!cardId) {
      return Response.json({ error: "Некоректний ідентифікатор картки." }, { status: 400 });
    }

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const deleted = await deleteCardForUser(userId, cardId);
    if (!deleted) {
      return Response.json({ error: "Картку не знайдено." }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося видалити картку.",
      },
      { status: 400 },
    );
  }
}
