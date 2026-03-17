import { recordAttemptForWord } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      wordId?: number;
      chosenIndex?: number;
      isCorrect?: boolean;
    };

    const userId = body.userId?.trim() ?? "";
    const wordId = Number(body.wordId);
    const chosenIndex = Number(body.chosenIndex);
    const isCorrect = Boolean(body.isCorrect);

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(wordId) || !Number.isInteger(chosenIndex)) {
      return Response.json(
        { error: "Некоректні дані спроби." },
        { status: 400 },
      );
    }

    const word = await recordAttemptForWord({
      userId,
      wordId,
      chosenIndex,
      isCorrect,
    });

    return Response.json({ word });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося зберегти результат спроби.",
      },
      { status: 400 },
    );
  }
}
