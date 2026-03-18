import { recordCardReviewForUser } from "@/lib/db";
import type { CardRating } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      cardId?: number;
      rating?: CardRating;
    };

    const userId = body.userId?.trim() ?? "";
    const cardId = Number(body.cardId);
    const rating = body.rating;

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(cardId)) {
      return Response.json({ error: "Некоректний ідентифікатор картки." }, { status: 400 });
    }

    if (!rating || !["again", "hard", "good", "easy"].includes(rating)) {
      return Response.json({ error: "Некоректний рейтинг відповіді." }, { status: 400 });
    }

    const card = await recordCardReviewForUser({ userId, cardId, rating });
    return Response.json({ card });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося зберегти результат картки.",
      },
      { status: 400 },
    );
  }
}
