import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { StressTrainerApp } from "@/components/stress-trainer-app";

const USER_ID_COOKIE_KEY = "learning-app-user-id";

export default async function StressPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(USER_ID_COOKIE_KEY)?.value?.trim() ?? "";

  if (!userId) {
    redirect("/");
  }

  return <StressTrainerApp userId={userId} />;
}
