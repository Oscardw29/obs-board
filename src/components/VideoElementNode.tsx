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
  const prevVisibleRef = useRef<boolean>(element.visible);
  const endedTriggeredRef = useRef<boolean>(false);
  const [locallyEndedHidden, setLocallyEndedHidden] = useState(false);

  const isPlaying = element.playing ?? true;
  // Auto-hide and loop are mutually exclusive: if autoHideOnEnd is enabled, never loop
  const isLoop = element.autoHideOnEnd ? false : (element.loop ?? false);
  const isMuted =
    mode === "thumbnail" || !element.visible
      ? true
      : (element.muted ?? false);
  const volume = Math.min(1, Math.max(0, element.volume ?? 0.85));
  const objectFit = element.objectFit ?? "contain";

  // Sync volume, mute & loop
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.volume = volume;
    vid.muted = isMuted;
    vid.loop = isLoop;
  }, [volume, isMuted, isLoop]);

  // Handle explicit re-trigger from 0:00 or visibility transition false -> true
  useEffect(() => {
    if (mode === "thumbnail") return;
    const vid = videoRef.current;
    if (!vid) return;

    const triggerChanged =
      Boolean(element.triggerId) && element.triggerId !== lastTriggerRef.current;
    const becameVisible = !prevVisibleRef.current && element.visible;
    prevVisibleRef.current = element.visible;

    const playSafe = () => {
      const p = vid.play();
      if (p) {
        p.catch(() => {
          vid.muted = true;
          void vid.play().catch(() => {});
        });
      }
    };

    if (triggerChanged || becameVisible) {
      lastTriggerRef.current = element.triggerId;
      endedTriggeredRef.current = false;
      setLocallyEndedHidden(false);

      const restartAndPlay = () => {
        try {
          vid.currentTime = 0;
        } catch {
          // ignore
        }
        if (isPlaying) playSafe();
      };

      if (vid.readyState >= 1) {
        restartAndPlay();
      } else {
        const onMeta = () => {
          vid.removeEventListener("loadedmetadata", onMeta);
          restartAndPlay();
        };
        vid.addEventListener("loadedmetadata", onMeta);
        if (isPlaying) playSafe();
        return () => vid.removeEventListener("loadedmetadata", onMeta);
      }
      return;
    }

    if (!element.visible) {
      vid.pause();
      return;
    }

    if (isPlaying && !locallyEndedHidden) {
      playSafe();
    } else {
      vid.pause();
    }
  }, [
    element.triggerId,
    isPlaying,
    mode,
    element.visible,
    locallyEndedHidden,
  ]);

  const finishPlayback = () => {
    if (isLoop || !element.autoHideOnEnd || endedTriggeredRef.current) return;
    endedTriggeredRef.current = true;
    const vid = videoRef.current;
    if (vid) {
      vid.pause();
      try {
        vid.currentTime = 0;
      } catch {
        // ignore
      }
    }
    if (mode === "obs") {
      setLocallyEndedHidden(true);
    } else if (mode === "editor") {
      onAutoHide?.(element.id);
    }
  };

  const handleTimeUpdate = () => {
    if (isLoop || !element.autoHideOnEnd) return;
    const vid = videoRef.current;
    if (!vid || !Number.isFinite(vid.duration) || vid.duration <= 0) return;
    if (vid.ended || vid.currentTime >= vid.duration - 0.05) {
      finishPlayback();
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
      autoPlay={mode !== "thumbnail" && isPlaying && element.visible}
      loop={isLoop}
      muted={isMuted}
      preload="auto"
      onEnded={finishPlayback}
      onTimeUpdate={handleTimeUpdate}
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
