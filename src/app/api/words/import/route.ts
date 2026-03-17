import { importWordsForUser } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; text?: string };
    const userId = body.userId?.trim() ?? "";
    const text = body.text ?? "";

    if (!userId) {
      return Response.json(
        { error: "Потрібно вказати ідентифікатор користувача." },
        { status: 400 },
      );
    }

    const result = await importWordsForUser(userId, text);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося імпортувати слова.",
      },
      { status: 400 },
    );
  }
}
