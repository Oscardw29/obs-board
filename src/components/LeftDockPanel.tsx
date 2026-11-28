"use client";

import React, { useState } from "react";
import { FolderKanban, Layers } from "lucide-react";
import type { BoardElement, MediaAsset, MediaFolder } from "@/types/board";
import type { AudioControlUpdate } from "./AudioElementNode";
import { LayersPanel } from "./LayersPanel";
import { MediaLibraryPanel } from "./MediaLibraryPanel";

interface LeftDockPanelProps {
  boardId: string;
  elements: BoardElement[];
  selectedIds: string[];
  assets: MediaAsset[];
  folders: MediaFolder[];
  canEdit: boolean;
  onSelectElements: (ids: string[]) => void;
  onPatchElement: (id: string, patch: Partial<BoardElement>) => void;
  onDeleteElements: (ids: string[]) => void;
  onDuplicateElement: (id: string) => void;
  onMoveLayer: (id: string, direction: "up" | "down") => void;
  onReorderLayer: (draggedId: string, targetId: string) => void;
  onTriggerVideo: (
    id: string,
    opts?: { playing?: boolean; visible?: boolean; restart?: boolean }
  ) => void;
  onControlAudio: (id: string, update: AudioControlUpdate) => void;
  onHideAllVideos: () => void;
  onShowAllLayers: () => void;
  onAssetUploaded: (asset: MediaAsset) => void;
  onAssetUpdated: (asset: MediaAsset) => void;
  onAssetDeleted: (assetId: string) => void;
  onFolderCreated: (folder: MediaFolder) => void;
  onFolderUpdated: (folder: MediaFolder) => void;
  onFolderDeleted: (folderId: string) => void;
  onInsertAsset: (
    asset: MediaAsset,
    options: { loop: boolean; autoHideOnEnd: boolean; muted: boolean }
  ) => void;
  onApplyFontAsset: (asset: MediaAsset) => void;
  onOpenDocumentModal: () => void;
}

export const LeftDockPanel: React.FC<LeftDockPanelProps> = (props) => {
  const [tab, setTab] = useState<"layers" | "library">("layers");

  return (
    <aside
      data-tour="left-dock"
      className="w-76 sm:w-80 shrink-0 h-full bg-studio-900/95 border-r border-white/[0.07] flex flex-col select-none"
    >
      {/* Animated Left Tabs: Capas (always on left!) + Biblioteca */}
      <div className="p-2.5 border-b border-white/[0.07]">
        <div className="relative grid grid-cols-2 bg-studio-950 p-1 rounded-xl border border-white/[0.07]">
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-studio-800 border border-white/[0.08] shadow transition-transform duration-200 ease-out"
            style={{
              transform:
                tab === "layers"
                  ? "translateX(0%)"
                  : "translateX(calc(100% + 4px))",
            }}
          />
          <button
            type="button"
            onClick={() => setTab("layers")}
            className={`relative z-10 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === "layers"
                ? "text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Capas</span>
            <span className="text-[10px] font-mono tabular-nums text-zinc-400">
              ({props.elements.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("library")}
            className={`relative z-10 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === "library"
                ? "text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5 text-sky-400" />
            <span>Biblioteca</span>
            <span className="text-[10px] font-mono tabular-nums text-zinc-400">
              ({props.assets.length})
            </span>
          </button>
        </div>
      </div>

      {tab === "layers" ? (
        <LayersPanel
          elements={props.elements}
          selectedIds={props.selectedIds}
          canEdit={props.canEdit}
          onSelectElements={props.onSelectElements}
          onPatchElement={props.onPatchElement}
          onDeleteElements={props.onDeleteElements}
          onDuplicateElement={props.onDuplicateElement}
          onMoveLayer={props.onMoveLayer}
          onReorderLayer={props.onReorderLayer}
          onTriggerVideo={props.onTriggerVideo}
          onControlAudio={props.onControlAudio}
          onHideAllVideos={props.onHideAllVideos}
          onShowAllLayers={props.onShowAllLayers}
        />
      ) : (
        <MediaLibraryPanel
          boardId={props.boardId}
          assets={props.assets}
          folders={props.folders}
          boardElements={props.elements}
          canEdit={props.canEdit}
          onAssetUploaded={props.onAssetUploaded}
          onAssetUpdated={props.onAssetUpdated}
          onAssetDeleted={props.onAssetDeleted}
          onFolderCreated={props.onFolderCreated}
          onFolderUpdated={props.onFolderUpdated}
          onFolderDeleted={props.onFolderDeleted}
          onInsertAsset={props.onInsertAsset}
          onApplyFontAsset={props.onApplyFontAsset}
          onOpenDocumentModal={props.onOpenDocumentModal}
          onQuickTriggerExisting={(elId) => {
            const target = props.elements.find((e) => e.id === elId);
            if (target?.type === "audio") {
              props.onControlAudio(elId, {
                playing: true,
                currentTimeSec: 0,
                commit: true,
              });
            } else {
              props.onTriggerVideo(elId, {
                restart: true,
                playing: true,
                visible: true,
              });
            }
          }}
        />
      )}
    </aside>
  );
};
