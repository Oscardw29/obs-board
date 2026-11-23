export interface FontOption {
  id: string;
  label: string;
  cssFamily: string;
  category: "sans" | "display" | "hand" | "serif" | "mono";
  sample: string;
}

export const FONT_CATALOG: FontOption[] = [
  {
    id: "Plus Jakarta Sans",
    label: "Plus Jakarta Sans",
    cssFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    category: "sans",
    sample: "Stream Pro",
  },
  {
    id: "Space Grotesk",
    label: "Space Grotesk",
    cssFamily: "'Space Grotesk', system-ui, sans-serif",
    category: "sans",
    sample: "Tech HUD",
  },
  {
    id: "Outfit",
    label: "Outfit",
    cssFamily: "'Outfit', system-ui, sans-serif",
    category: "sans",
    sample: "Clean Overlay",
  },
  {
    id: "Montserrat",
    label: "Montserrat",
    cssFamily: "'Montserrat', system-ui, sans-serif",
    category: "sans",
    sample: "Broadcast",
  },
  {
    id: "Poppins",
    label: "Poppins",
    cssFamily: "'Poppins', system-ui, sans-serif",
    category: "sans",
    sample: "Directo",
  },
  {
    id: "Bebas Neue",
    label: "Bebas Neue",
    cssFamily: "'Bebas Neue', Impact, sans-serif",
    category: "display",
    sample: "EN VIVO",
  },
  {
    id: "Anton",
    label: "Anton",
    cssFamily: "'Anton', Impact, sans-serif",
    category: "display",
    sample: "IMPACTO",
  },
  {
    id: "Bangers",
    label: "Bangers",
    cssFamily: "'Bangers', cursive",
    category: "display",
    sample: "COMIC!",
  },
  {
    id: "Fredoka",
    label: "Fredoka",
    cssFamily: "'Fredoka', system-ui, sans-serif",
    category: "display",
    sample: "Divertido",
  },
  {
    id: "Righteous",
    label: "Righteous",
    cssFamily: "'Righteous', system-ui, sans-serif",
    category: "display",
    sample: "Arcade",
  },
  {
    id: "Caveat",
    label: "Caveat (Manuscrita)",
    cssFamily: "'Caveat', cursive",
    category: "hand",
    sample: "Nota rápida",
  },
  {
    id: "Permanent Marker",
    label: "Permanent Marker",
    cssFamily: "'Permanent Marker', cursive",
    category: "hand",
    sample: "Marcador",
  },
  {
    id: "Patrick Hand",
    label: "Patrick Hand",
    cssFamily: "'Patrick Hand', cursive",
    category: "hand",
    sample: "Pizarra",
  },
  {
    id: "Playfair Display",
    label: "Playfair Display",
    cssFamily: "'Playfair Display', Georgia, serif",
    category: "serif",
    sample: "Editorial",
  },
  {
    id: "JetBrains Mono",
    label: "JetBrains Mono",
    cssFamily: "'JetBrains Mono', ui-monospace, monospace",
    category: "mono",
    sample: "00:42:18",
  },
];

const LEGACY_FONT_MAP: Record<string, string> = {
  hand: "Caveat",
  sans: "Plus Jakarta Sans",
  mono: "JetBrains Mono",
};

export function normalizeFontFamilyId(family?: string): string {
  if (!family) return "Plus Jakarta Sans";
  return LEGACY_FONT_MAP[family] ?? family;
}

export function resolveFontFamilyCss(
  family?: string,
  customFontName?: string
): string {
  if (customFontName) {
    return `'${customFontName.replace(/'/g, "")}', system-ui, sans-serif`;
  }
  const normalized = normalizeFontFamilyId(family);
  const found = FONT_CATALOG.find(
    (f) => f.id.toLowerCase() === normalized.toLowerCase()
  );
  if (found) return found.cssFamily;
  return `'${normalized.replace(/'/g, "")}', system-ui, sans-serif`;
}

const loadedCustomFonts = new Map<string, Promise<void>>();

export function ensureCustomFontLoaded(
  fontFamily?: string,
  fontUrl?: string
): Promise<void> {
  if (typeof window === "undefined" || !fontFamily || !fontUrl) {
    return Promise.resolve();
  }
  const cacheKey = `${fontFamily}::${fontUrl}`;
  const existing = loadedCustomFonts.get(cacheKey);
  if (existing) return existing;

  const cleanFamily = fontFamily.replace(/['"]/g, "");
  const promise = (async () => {
    try {
      const face = new FontFace(cleanFamily, `url("${fontUrl}")`);
      const loaded = await face.load();
      document.fonts.add(loaded);
    } catch {
      // Font failed to load; fallback system font stays active
    }
  })();

  loadedCustomFonts.set(cacheKey, promise);
  return promise;
}

export function sanitizeFontNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, "").trim();
  const cleaned = base.replace(/[^a-zA-Z0-9 _-]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || `Fuente_${Date.now().toString(36)}`;
}
