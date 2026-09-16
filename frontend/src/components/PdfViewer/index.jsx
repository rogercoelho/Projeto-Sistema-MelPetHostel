import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import api from "../../services/api";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function base64ToBytes(base64) {
  const binary = window.atob(base64 || "");
  const data = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    data[index] = binary.charCodeAt(index);
  }

  return data;
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

export default function PdfViewer({ src, title, style }) {
  const pagesRef = useRef(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let canceled = false;
    let loadingTask;
    let loadedDocument;

    async function loadPdf() {
      if (!src) {
        setPdfDocument(null);
        return;
      }

      setStatus("loading");
      setErrorMessage("");
      setPdfDocument(null);
      setZoom(1);

      try {
        const preview = await api.get(src);
        if (canceled) return;

        loadingTask = pdfjsLib.getDocument({ data: base64ToBytes(preview?.base64) });
        loadedDocument = await loadingTask.promise;

        if (!canceled) {
          setPdfDocument(loadedDocument);
        }
      } catch (error) {
        if (canceled) return;
        console.error("Erro ao carregar PDF:", error);
        setErrorMessage(error?.message || "Não foi possível carregar o PDF.");
        setStatus("error");
      }
    }

    loadPdf();

    return () => {
      canceled = true;
      loadingTask?.destroy?.();
      loadedDocument?.destroy?.();
    };
  }, [src]);

  useEffect(() => {
    const container = pagesRef.current;
    if (!container) return undefined;

    const updateWidth = () => {
      const width = Math.floor(container.clientWidth);
      setContainerWidth((current) => (current === width ? current : width));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let canceled = false;
    const renderTasks = [];
    const container = pagesRef.current;

    async function renderPdf() {
      if (!pdfDocument || !container || !containerWidth) return;

      container.replaceChildren();
      setStatus("rendering");

      try {
        const availableWidth = Math.max(containerWidth - 36, 280);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          if (canceled) return;

          const page = await pdfDocument.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const fitScale = Math.min(availableWidth / baseViewport.width, 2.5);
          const cssScale = fitScale * zoom;
          const renderScale = cssScale * pixelRatio;
          const viewport = page.getViewport({ scale: renderScale });
          const cssViewport = page.getViewport({ scale: cssScale });

          const canvas = document.createElement("canvas");
          canvas.className = "pdf-viewer-page";
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = `${Math.ceil(cssViewport.width)}px`;
          canvas.style.height = `${Math.ceil(cssViewport.height)}px`;
          canvas.setAttribute("aria-label", `${title || "Documento"} - página ${pageNumber}`);
          container.appendChild(canvas);

          const context = canvas.getContext("2d", { alpha: false });
          const renderTask = page.render({ canvasContext: context, viewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }

        if (!canceled) setStatus("ready");
      } catch (error) {
        if (canceled || error?.name === "RenderingCancelledException") return;
        console.error("Erro ao renderizar PDF:", error);
        setErrorMessage(error?.message || "Não foi possível renderizar o PDF.");
        setStatus("error");
      }
    }

    renderPdf();

    return () => {
      canceled = true;
      renderTasks.forEach((task) => task.cancel?.());
    };
  }, [containerWidth, pdfDocument, title, zoom]);

  const changeZoom = (direction) => {
    setZoom((current) => clampZoom(current + direction * ZOOM_STEP));
  };

  const isBusy = status === "loading" || status === "rendering";

  return (
    <div className="pdf-viewer" style={style || {}}>
      <div className="pdf-viewer-toolbar" role="toolbar" aria-label="Controles de zoom do documento">
        <span className="pdf-viewer-toolbar-label">Zoom</span>
        <button
          type="button"
          className="pdf-viewer-zoom-button"
          onClick={() => changeZoom(-1)}
          disabled={isBusy || zoom <= MIN_ZOOM}
          aria-label="Diminuir zoom"
        >
          −
        </button>
        <output className="pdf-viewer-zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button
          type="button"
          className="pdf-viewer-zoom-button"
          onClick={() => changeZoom(1)}
          disabled={isBusy || zoom >= MAX_ZOOM}
          aria-label="Aumentar zoom"
        >
          +
        </button>
        <button
          type="button"
          className="pdf-viewer-reset-button"
          onClick={() => setZoom(1)}
          disabled={isBusy || zoom === 1}
        >
          Ajustar
        </button>
      </div>

      {isBusy ? <div className="pdf-viewer-state">Renderizando documento em alta qualidade...</div> : null}
      {status === "error" ? <div className="pdf-viewer-state pdf-viewer-state--error">{errorMessage}</div> : null}
      <div ref={pagesRef} className="pdf-viewer-pages" />
    </div>
  );
}