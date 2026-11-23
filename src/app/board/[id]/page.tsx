import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { BoardEditor } from "@/components/BoardEditor";
import { getCurrentUser } from "@/lib/auth";
import { getBoardForUser, listBoardMediaLibrary } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const [board, library] = await Promise.all([
    getBoardForUser(id, user),
    listBoardMediaLibrary(user, id),
  ]);

  if (!board) {
    return (
      <div className="min-h-screen bg-studio-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-studio-900 border border-white/[0.1] p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-white">
              Sin acceso a este tablero
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Este tablero es privado o no existe. Pídele al propietario que
              invite tu correo (<span className="text-zinc-200">{user.email}</span>
              ) desde el botón Compartir.
            </p>
          </div>
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
          >
            Volver a mis tableros
          </Link>
        </div>
      </div>
    );
  }

  return (
    <BoardEditor
      initialBoard={board}
      initialAssets={library.assets}
      initialFolders={library.folders}
      user={user}
    />
  );
}
