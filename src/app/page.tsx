import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { getCurrentUser } from "@/lib/auth";
import { getAppMode } from "@/lib/config";
import { listBoardsForUser, listMediaForUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [boards, media] = await Promise.all([
    listBoardsForUser(user),
    listMediaForUser(user),
  ]);

  return (
    <DashboardClient
      user={user}
      mode={getAppMode()}
      initialBoards={boards}
      initialMediaCount={media.length}
    />
  );
}
