"use client";

import React from "react";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-base tracking-tight",
  md: "text-lg tracking-tight",
  lg: "text-2xl tracking-tight",
  xl: "text-4xl sm:text-5xl tracking-tight",
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = "md",
  className = "",
}) => {
  return (
    <span
      translate="no"
      className={`inline-flex items-baseline font-bold select-none leading-none ${SIZE_CLASSES[size]} ${className}`}
    >
      <span className="text-white">OB</span>
      <span className="oboards-glow lowercase font-bold">oard</span>
      <span className="text-white">S</span>
    </span>
  );
};
