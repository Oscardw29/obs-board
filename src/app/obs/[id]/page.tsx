import { ObsStageClient } from "@/components/ObsStageClient";
import { getBoardForObs } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ObsBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  const board = await getBoardForObs(id, token ?? "");

  if (!board) {
    return (
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ backgroundColor: "transparent" }}
      >
        <div className="px-4 py-2 rounded-xl bg-black/75 text-rose-300 text-xs font-mono border border-rose-500/40">
          OBS Board: Token de fuente inválido o regenerado. Copia la URL nueva
          desde Compartir.
        </div>
      </div>
    );
  }

  return (
    <ObsStageClient
      boardId={board.id}
      obsToken={token ?? ""}
      stageWidth={board.stageWidth}
      stageHeight={board.stageHeight}
      initialElements={board.elements}
    />
  );
}
