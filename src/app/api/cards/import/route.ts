import { importCardsForUser } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      deckId?: number;
      text?: string;
    };
    const userId = body.userId?.trim() ?? "";
    const deckId = Number(body.deckId);
    const text = body.text ?? "";

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(deckId)) {
      return Response.json({ error: "Некоректний ідентифікатор колоди." }, { status: 400 });
    }

    const result = await importCardsForUser({ userId, deckId, text });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося імпортувати картки.",
      },
      { status: 400 },
    );
  }
}
