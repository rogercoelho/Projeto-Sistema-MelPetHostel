import { pdf } from "@react-pdf/renderer";
import ContractPdfDocument from "./ContractPdfDocument";

function sanitizeFileName(value) {
  return String(value || "contrato-mel-pet-hostel")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function contractFileName(contractorName) {
  return `contrato-mel-pet-hostel-${sanitizeFileName(contractorName) || "cliente"}.pdf`;
}

async function downloadPdfBlob(blob, fileName) {
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Documento PDF",
            accept: {
              "application/pdf": [".pdf"],
            },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error?.name === "AbortError") return false;
      throw error;
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = blobUrl;
  downloadLink.download = fileName;
  downloadLink.rel = "noopener";
  downloadLink.style.display = "none";

  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

  return true;
}

export async function saveContractPdf({
  browserName,
  clientIp,
  contractorData,
  signatureCity,
  signatureDate,
  signatureTime,
}) {
  const fileName = contractFileName(contractorData?.nome);
  const blob = await pdf(
    <ContractPdfDocument
      browserName={browserName}
      clientIp={clientIp}
      contractorData={contractorData}
      signatureCity={signatureCity}
      signatureDate={signatureDate}
      signatureTime={signatureTime}
    />,
  ).toBlob();

  return downloadPdfBlob(blob, fileName);
}
