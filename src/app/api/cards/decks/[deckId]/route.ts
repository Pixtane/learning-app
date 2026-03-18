import { deleteDeckForUser, updateDeckForUser } from "@/lib/db";

function parseDeckId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  try {
    const { deckId: deckIdParam } = await context.params;
    const deckId = parseDeckId(deckIdParam);
    const body = (await request.json()) as { userId?: string; name?: string };
    const userId = body.userId?.trim() ?? "";
    const name = body.name?.trim() ?? "";

    if (!deckId) {
      return Response.json({ error: "Некоректний ідентифікатор колоди." }, { status: 400 });
    }

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const deck = await updateDeckForUser(userId, deckId, name);
    return Response.json({ deck });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося оновити колоду.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  try {
    const { deckId: deckIdParam } = await context.params;
    const deckId = parseDeckId(deckIdParam);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim() ?? "";

    if (!deckId) {
      return Response.json({ error: "Некоректний ідентифікатор колоди." }, { status: 400 });
    }

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const deleted = await deleteDeckForUser(userId, deckId);
    if (!deleted) {
      return Response.json({ error: "Колоду не знайдено." }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося видалити колоду.",
      },
      { status: 400 },
    );
  }
}
