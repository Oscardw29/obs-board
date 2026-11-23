import React from "react";

export default function ObsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="obs-stage-root fixed inset-0 w-screen h-screen"
      style={{ backgroundColor: "transparent" }}
    >
      {children}
    </div>
  );
}
