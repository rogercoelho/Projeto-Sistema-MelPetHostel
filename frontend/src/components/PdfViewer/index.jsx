import React from "react";

export default function PdfViewer({ src, title, style }) {
  // Simple wrapper that renders an iframe for PDFs. Kept minimal to allow
  // lazy-loading via React.lazy in callers and to be replaced later with a
  // more advanced viewer using workers if needed.
  return (
    <iframe
      src={src}
      title={title}
      style={{ width: "100%", height: "70vh", border: 0, ...(style || {}) }}
    />
  );
}
