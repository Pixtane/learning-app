import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DatesTrainerApp } from "@/components/dates-trainer-app";

const USER_ID_COOKIE_KEY = "learning-app-user-id";

export default async function DatesPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(USER_ID_COOKIE_KEY)?.value?.trim() ?? "";

  if (!userId) {
    redirect("/");
  }

  return <DatesTrainerApp userId={userId} />;
}
