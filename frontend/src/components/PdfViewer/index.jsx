import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function PdfViewer({ src, title, style }) {
  const pagesRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let canceled = false;
    const container = pagesRef.current;

    async function renderPdf() {
      if (!src || !container) return;

      renderTaskRef.current?.destroy?.();
      container.innerHTML = "";
      setStatus("loading");
      setErrorMessage("");

      try {
        const response = await fetch(src, { credentials: "include" });
        if (!response.ok) {
          throw new Error(`Nao foi possivel carregar o PDF (${response.status}).`);
        }

        const data = await response.arrayBuffer();
        if (canceled) return;

        const loadingTask = pdfjsLib.getDocument({ data });
        renderTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        if (canceled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const containerWidth = Math.max(container.clientWidth || 900, 320);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (canceled) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const cssScale = Math.min(containerWidth / baseViewport.width, 2.2);
          const renderScale = cssScale * dpr;
          const viewport = page.getViewport({ scale: renderScale });
          const cssViewport = page.getViewport({ scale: cssScale });

          const canvas = document.createElement("canvas");
          canvas.className = "pdf-viewer-page";
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(cssViewport.width)}px`;
          canvas.style.height = `${Math.floor(cssViewport.height)}px`;
          canvas.setAttribute("aria-label", `${title || "Documento"} - pagina ${pageNumber}`);

          container.appendChild(canvas);

          const context = canvas.getContext("2d", { alpha: false });
          await page.render({ canvasContext: context, viewport }).promise;
        }

        if (!canceled) setStatus("ready");
      } catch (error) {
        if (canceled) return;
        console.error("Erro ao renderizar PDF:", error);
        setErrorMessage(error?.message || "Nao foi possivel renderizar o PDF.");
        setStatus("error");
      }
    }

    renderPdf();

    return () => {
      canceled = true;
      renderTaskRef.current?.destroy?.();
    };
  }, [src, title]);

  return (
    <div className="pdf-viewer" style={style || {}}>
      {status === "loading" ? (
        <div className="pdf-viewer-state">Convertendo PDF para imagem...</div>
      ) : null}
      {status === "error" ? (
        <div className="pdf-viewer-state pdf-viewer-state--error">
          {errorMessage}
        </div>
      ) : null}
      <div ref={pagesRef} className="pdf-viewer-pages" />
    </div>
  );
}