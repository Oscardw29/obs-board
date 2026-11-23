"use client";

export interface LoadedDocumentHandle {
  title: string;
  pageCount: number;
  kind: "pdf" | "text";
  renderPageToDataUrl: (pageNumber: number, scale?: number) => Promise<{
    dataUrl: string;
    width: number;
    height: number;
  }>;
  renderPageToBlob: (pageNumber: number, scale?: number) => Promise<{
    blob: Blob;
    width: number;
    height: number;
  }>;
  dispose: () => void;
}

function paginatePlainText(content: string, linesPerPage = 24): string[][] {
  const rawLines = content.replace(/\r\n/g, "\n").split("\n");
  const wrapped: string[] = [];
  const maxChars = 76;

  for (const line of rawLines) {
    if (line.length <= maxChars) {
      wrapped.push(line);
      continue;
    }
    let remaining = line;
    while (remaining.length > maxChars) {
      let splitAt = remaining.lastIndexOf(" ", maxChars);
      if (splitAt < 20) splitAt = maxChars;
      wrapped.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    if (remaining) wrapped.push(remaining);
  }

  if (wrapped.length === 0) return [["(Documento vacío)"]];

  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }
  return pages;
}

function renderTextPageToCanvas(
  title: string,
  lines: string[],
  pageNumber: number,
  totalPages: number,
  scale = 1
): HTMLCanvasElement {
  const width = Math.round(960 * scale);
  const height = Math.round(1240 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.scale(scale, scale);

  // Clean dark editorial card sheet
  ctx.fillStyle = "#10131c";
  ctx.fillRect(0, 0, 960, 1240);

  ctx.strokeStyle = "#2a3146";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 956, 1236);

  // Header bar
  ctx.fillStyle = "#161a26";
  ctx.fillRect(4, 4, 952, 86);

  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(40, 28, 6, 36);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 28px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(title.slice(0, 48), 64, 56);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 18px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";
  ctx.fillText(`Pág. ${pageNumber}/${totalPages}`, 912, 55);
  ctx.textAlign = "left";

  // Body text
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "400 22px 'JetBrains Mono', monospace";
  let y = 148;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      ctx.fillStyle = "#38bdf8";
      ctx.font = "700 28px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText(line.slice(2), 52, y);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "400 22px 'JetBrains Mono', monospace";
    } else if (line.startsWith("## ")) {
      ctx.fillStyle = "#bae6fd";
      ctx.font = "600 24px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText(line.slice(3), 52, y);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "400 22px 'JetBrains Mono', monospace";
    } else {
      ctx.fillText(line, 52, y);
    }
    y += 42;
  }

  return canvas;
}

export async function loadDocumentForAttachment(
  file: File
): Promise<LoadedDocumentHandle> {
  const lower = file.name.toLowerCase();
  const title = file.name.replace(/\.[^/.]+$/, "") || "Documento";

  if (lower.endsWith(".txt") || lower.endsWith(".md") || file.type.startsWith("text/")) {
    const content = await file.text();
    const pages = paginatePlainText(content);

    return {
      title,
      pageCount: pages.length,
      kind: "text",
      async renderPageToDataUrl(pageNumber, scale = 0.35) {
        const idx = Math.max(0, Math.min(pages.length - 1, pageNumber - 1));
        const canvas = renderTextPageToCanvas(
          title,
          pages[idx],
          pageNumber,
          pages.length,
          scale
        );
        return {
          dataUrl: canvas.toDataURL("image/png"),
          width: 960,
          height: 1240,
        };
      },
      async renderPageToBlob(pageNumber, scale = 1) {
        const idx = Math.max(0, Math.min(pages.length - 1, pageNumber - 1));
        const canvas = renderTextPageToCanvas(
          title,
          pages[idx],
          pageNumber,
          pages.length,
          scale
        );
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("No se pudo renderizar la página."))),
            "image/png"
          );
        });
        return { blob, width: 960, height: 1240 };
      },
      dispose() {},
    };
  }

  if (!lower.endsWith(".pdf") && file.type !== "application/pdf") {
    throw new Error(
      "Formato de documento no compatible. Usa PDF (.pdf), Texto (.txt) o Markdown (.md)."
    );
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdfDoc = await loadingTask.promise;

  const renderPdfPage = async (pageNumber: number, scale: number) => {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible.");

    // White paper sheet background for crisp transparency contrast in OBS
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    const baseVp = page.getViewport({ scale: 1 });
    return {
      canvas,
      width: Math.round(baseVp.width),
      height: Math.round(baseVp.height),
    };
  };

  return {
    title,
    pageCount: pdfDoc.numPages,
    kind: "pdf",
    async renderPageToDataUrl(pageNumber, scale = 0.4) {
      const { canvas, width, height } = await renderPdfPage(pageNumber, scale);
      return {
        dataUrl: canvas.toDataURL("image/png"),
        width,
        height,
      };
    },
    async renderPageToBlob(pageNumber, scale = 1.75) {
      const { canvas, width, height } = await renderPdfPage(pageNumber, scale);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("No se pudo exportar la página PDF."))),
          "image/png"
        );
      });
      return { blob, width, height };
    },
    dispose() {
      void loadingTask.destroy();
    },
  };
}
