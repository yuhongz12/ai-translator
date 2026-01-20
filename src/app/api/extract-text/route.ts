import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

// Keep this Route Handler on Node.js runtime (not Edge).
export const runtime = "nodejs";

// Guardrails
const MAX_BYTES = 3 * 1024 * 1024; // 3MB max upload size
const MAX_CHARS = 200_000; // limit response payload / downstream prompt size

const TEXT_EXTS = new Set(["txt", "md", "csv", "json", "xml", "yaml", "yml"]);
const DOCX_EXTS = new Set(["docx"]);
const PDF_EXTS = new Set(["pdf"]);

const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

function normalizeText(s: string) {
    // Remove null chars + trim; also collapse excessive whitespace a bit
    return s.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

function getExt(filename: string) {
    const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/i);
    return m?.[1] ?? "";
}

function truncateText(text: string) {
    const originalChars = text.length;
    const truncated = originalChars > MAX_CHARS;
    const finalText = truncated ? text.slice(0, MAX_CHARS) : text;
    return { finalText, truncated, originalChars };
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
    return NextResponse.json({ error, ...(extra ?? {}) }, { status });
}

export async function POST(req: Request) {
    try {
        // Optional: quickly fail if caller didn't send multipart/form-data.
        // (req.formData() will also throw for invalid bodies.)
        const contentType = req.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) {
            return jsonError(415, "Expected multipart/form-data.");
        }

        // Route Handlers can read multipart bodies via formData(). :contentReference[oaicite:1]{index=1}
        const form = await req.formData();
        const file = form.get("file");

        if (!file || !(file instanceof File)) {
            return jsonError(400, "Missing file (field name must be 'file').");
        }

        if (file.size <= 0) {
            return jsonError(400, "Empty file.");
        }

        if (file.size > MAX_BYTES) {
            return jsonError(413, "File too large. Max supported size is 3MB.", {
                maxBytes: MAX_BYTES,
                maxMB: MAX_BYTES / (1024 * 1024),
            });
        }

        const filename = file.name || "upload";
        const ext = getExt(filename);
        const mime = file.type || "application/octet-stream";

        // ---------- Plain text-ish ----------
        if (mime.startsWith("text/") || TEXT_EXTS.has(ext)) {
            const raw = await file.text();
            const normalized = normalizeText(raw);
            const { finalText, truncated, originalChars } = truncateText(normalized);

            return NextResponse.json({
                text: finalText,
                filename,
                mime,
                ext,
                chars: finalText.length,
                originalChars,
                truncated,
            });
        }

        // ---------- DOCX ----------
        if (mime === DOCX_MIME || DOCX_EXTS.has(ext)) {
            const buf = Buffer.from(await file.arrayBuffer());
            const mammoth = await import("mammoth");

            try {
                const result = await mammoth.extractRawText({ buffer: buf });
                const normalized = normalizeText(result.value ?? "");
                const { finalText, truncated, originalChars } = truncateText(normalized);

                return NextResponse.json({
                    text: finalText,
                    filename,
                    mime: DOCX_MIME,
                    ext,
                    chars: finalText.length,
                    originalChars,
                    truncated,
                });
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return jsonError(422, "Failed to extract text from DOCX.", { details: message });
            }
        }

        // ---------- PDF ----------
        if (mime === PDF_MIME || PDF_EXTS.has(ext)) {
            const buf = Buffer.from(await file.arrayBuffer());
            const parser = new PDFParse({ data: buf });

            try {
                const result = await parser.getText();
                const normalized = normalizeText(result?.text ?? "");
                const { finalText, truncated, originalChars } = truncateText(normalized);

                return NextResponse.json({
                    text: finalText,
                    filename,
                    mime: PDF_MIME,
                    ext,
                    chars: finalText.length,
                    originalChars,
                    truncated,
                });
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);

                // Common cases: scanned PDFs (little/no text), encrypted PDFs, malformed PDFs, etc.
                return jsonError(422, "Failed to extract text from PDF.", { details: message });
            } finally {
                // Ensure native resources / workers are cleaned up.
                await parser.destroy();
            }
        }

        // ---------- Unsupported ----------
        return jsonError(415, `Unsupported file type. File translation only supported text, docx, and pdf files.`, { filename, mime, ext });
    } catch (err) {
        // Log full error server-side, return safe message to client
        const message = err instanceof Error ? err.message : String(err);
        return jsonError(500, "Extract failed.", { details: message });
    }
}
