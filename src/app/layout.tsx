import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OBoardS — Tablero Colaborativo para OBS Studio",
  description:
    "Tablero colaborativo en tiempo real con salida 100% transparente para OBS Studio, biblioteca compartida en carpetas, multi-pinceles, animaciones, imán y control en vivo.",
};

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Anton",
    "family=Bangers",
    "family=Bebas+Neue",
    "family=Caveat:wght@500;700",
    "family=Fredoka:wght@400;600;700",
    "family=JetBrains+Mono:wght@400;500;600;700",
    "family=Montserrat:ital,wght@0,400;0,600;0,700;1,400;1,700",
    "family=Outfit:wght@400;500;600;700",
    "family=Patrick+Hand",
    "family=Permanent+Marker",
    "family=Playfair+Display:ital,wght@0,600;0,700;1,600",
    "family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700",
    "family=Poppins:ital,wght@0,400;0,600;0,700;1,400",
    "family=Righteous",
    "family=Space+Grotesk:wght@400;500;600;700",
    "display=swap",
  ].join("&");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      style={{ backgroundColor: "transparent", colorScheme: "dark" }}
    >
      <head>
        <meta name="theme-color" content="#090b10" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
      </head>
      <body
        className="font-sans antialiased selection:bg-sky-500/35 selection:text-white"
        style={{ backgroundColor: "transparent" }}
      >
        {children}
      </body>
    </html>
  );
}
