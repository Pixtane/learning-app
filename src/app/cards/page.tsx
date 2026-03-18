import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CardsTrainerApp } from "@/components/cards-trainer-app";

const USER_ID_COOKIE_KEY = "learning-app-user-id";

export default async function CardsPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(USER_ID_COOKIE_KEY)?.value?.trim() ?? "";

  if (!userId) {
    redirect("/");
  }

  return <CardsTrainerApp userId={userId} />;
}
