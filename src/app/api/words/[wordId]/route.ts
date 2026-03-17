import { deleteWordForUser, updateWordForUser } from "@/lib/db";

function parseWordId(value: string): number | null {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) ? parsedValue : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ wordId: string }> },
) {
  try {
    const { wordId: wordIdParam } = await context.params;
    const wordId = parseWordId(wordIdParam);
    const body = (await request.json()) as { userId?: string; word?: string };
    const userId = body.userId?.trim() ?? "";
    const word = body.word?.trim() ?? "";

    if (!wordId) {
      return Response.json({ error: "Некоректний ідентифікатор слова." }, { status: 400 });
    }

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const updatedWord = await updateWordForUser(userId, wordId, word);
    return Response.json({ word: updatedWord });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося оновити слово.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ wordId: string }> },
) {
  try {
    const { wordId: wordIdParam } = await context.params;
    const wordId = parseWordId(wordIdParam);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim() ?? "";

    if (!wordId) {
      return Response.json({ error: "Некоректний ідентифікатор слова." }, { status: 400 });
    }

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const deleted = await deleteWordForUser(userId, wordId);

    if (!deleted) {
      return Response.json({ error: "Слово не знайдено." }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося видалити слово.",
      },
      { status: 400 },
    );
  }
}
