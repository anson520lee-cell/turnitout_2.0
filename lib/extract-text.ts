/**
 * Pull plain text out of a file in the browser, so documents for the free
 * scan never leave the user's device as files; only the extracted text is
 * sent, exactly as if it had been pasted.
 */

export const SCAN_FILE_ACCEPT = ".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const SCAN_FILE_MAX_BYTES = 10 * 1024 * 1024;

export class ExtractError extends Error {}

function kindOf(file: File): "txt" | "docx" | "pdf" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || file.type === "text/plain") return "txt";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  return null;
}

export async function extractText(file: File): Promise<string> {
  const kind = kindOf(file);
  if (!kind) throw new ExtractError("Upload a .docx, .pdf or .txt file.");
  if (file.size > SCAN_FILE_MAX_BYTES) throw new ExtractError("That file is over 10 MB. Paste the text instead.");

  let text = "";
  try {
    if (kind === "txt") {
      text = await file.text();
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      text = value;
    } else {
      const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const { text: pages } = await pdfText(pdf, { mergePages: false });
      text = pages.join("\n\n");
    }
  } catch {
    throw new ExtractError("We couldn't read that file. If it's a scanned PDF or password-protected, paste the text instead.");
  }

  // Normalise line endings and collapse runs of blank lines to one paragraph break.
  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new ExtractError("No text was found in that file. Scanned PDFs (images of pages) can't be read.");
  return text;
}
