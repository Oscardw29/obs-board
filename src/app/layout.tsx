import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OBS Board — Tablero Colaborativo para OBS Studio",
  description:
    "Tablero colaborativo en tiempo real estilo Excalidraw con salida 100% transparente para OBS Studio, biblioteca de clips y control de capas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" style={{ backgroundColor: "transparent" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="font-sans antialiased selection:bg-indigo-500/40 selection:text-white"
        style={{ backgroundColor: "transparent" }}
      >
        {children}
      </body>
    </html>
  );
}
