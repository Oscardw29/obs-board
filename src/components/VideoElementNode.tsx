"use client";

import React, { useEffect, useRef, useState } from "react";
import type { BoardElement } from "@/types/board";

interface VideoElementNodeProps {
  element: BoardElement;
  mode: "editor" | "obs" | "thumbnail";
  onAutoHide?: (elementId: string) => void;
}

export const VideoElementNode: React.FC<VideoElementNodeProps> = ({
  element,
  mode,
  onAutoHide,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastTriggerRef = useRef<string | undefined>(undefined);
  const [locallyEndedHidden, setLocallyEndedHidden] = useState(false);

  const isPlaying = element.playing ?? true;
  const isLoop = element.loop ?? false;
  const isMuted =
    mode === "thumbnail" ? true : (element.muted ?? false);
  const volume = Math.min(1, Math.max(0, element.volume ?? 0.85));
  const objectFit = element.objectFit ?? "contain";

  // Sync volume & mute
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.volume = volume;
    vid.muted = isMuted;
    vid.loop = isLoop;
  }, [volume, isMuted, isLoop]);

  // Handle explicit re-trigger from 0:00
  useEffect(() => {
    if (mode === "thumbnail") return;
    const vid = videoRef.current;
    if (!vid) return;

    const triggerChanged =
      element.triggerId && element.triggerId !== lastTriggerRef.current;

    if (triggerChanged) {
      lastTriggerRef.current = element.triggerId;
      setLocallyEndedHidden(false);
      try {
        vid.currentTime = 0;
      } catch {
        // Metadata may not be loaded yet
      }
      if (isPlaying) {
        const playPromise = vid.play();
        if (playPromise) {
          playPromise.catch(() => {
            // Browser autoplay policy fallback when previewed in desktop tab without user gesture
            vid.muted = true;
            void vid.play().catch(() => {});
          });
        }
      }
      return;
    }

    if (isPlaying) {
      setLocallyEndedHidden(false);
      const playPromise = vid.play();
      if (playPromise) {
        playPromise.catch(() => {
          vid.muted = true;
          void vid.play().catch(() => {});
        });
      }
    } else {
      vid.pause();
    }
  }, [element.triggerId, isPlaying, mode, element.visible]);

  // Reset local hide when element becomes visible again
  useEffect(() => {
    if (element.visible) {
      setLocallyEndedHidden(false);
    }
  }, [element.visible, element.triggerId]);

  const handleEnded = () => {
    if (!isLoop && element.autoHideOnEnd) {
      if (mode === "obs") {
        setLocallyEndedHidden(true);
      } else if (mode === "editor") {
        onAutoHide?.(element.id);
      }
    }
  };

  if (locallyEndedHidden && mode === "obs") {
    return null;
  }

  return (
    <video
      ref={videoRef}
      src={element.src}
      playsInline
      autoPlay={mode !== "thumbnail" && isPlaying}
      loop={isLoop}
      muted={isMuted}
      preload="auto"
      onEnded={handleEnded}
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit,
        display: "block",
        backgroundColor: "transparent",
        pointerEvents: "none",
      }}
    />
  );
};
