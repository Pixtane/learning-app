import { recordDateAttemptForUser } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      dateId?: number;
      isCorrect?: boolean;
      associationIds?: number[];
    };

    const userId = body.userId?.trim() ?? "";
    const dateId = Number(body.dateId);
    const associationIds = body.associationIds?.map((id) => Number(id));
    const hasAssociation =
      associationIds !== undefined && associationIds.length > 0;
    const hasCorrectness = typeof body.isCorrect === "boolean";

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(dateId)) {
      return Response.json({ error: "Некоректний ідентифікатор дати." }, { status: 400 });
    }

    if (!hasCorrectness && !hasAssociation) {
      return Response.json(
        { error: "Потрібно вказати результат або асоціації." },
        { status: 400 },
      );
    }

    if (hasAssociation) {
      if (
        associationIds.length !== 3 ||
        associationIds.some((id) => !Number.isInteger(id))
      ) {
        return Response.json(
          { error: "Потрібно вказати рівно три дати для асоціації." },
          { status: 400 },
        );
      }
    }

    const date = await recordDateAttemptForUser({
      userId,
      dateId,
      isCorrect: hasCorrectness ? body.isCorrect : undefined,
      associationIds: hasAssociation ? associationIds : undefined,
    });

    return Response.json({ date });
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
