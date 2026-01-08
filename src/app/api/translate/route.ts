import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { performance } from "node:perf_hooks";

export const maxDuration = 30; // aligns with Groq AI SDK examples

type Body = {
  text: string;
  fromLang: string;
  toLang: string;
  model?: string;
};

function buildSystemPrompt(fromLang: string, toLang: string) {
  return [
    "You are a translation engine.",
    `Translate from ${fromLang} to ${toLang}.`,
    "Preserve meaning, tone, punctuation, and formatting.",
    "Do not add commentary, explanations, or quotes.",
    "Output ONLY the translated text.",
  ].join(" ");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const text = (body.text ?? "").trim();
    const fromLang = (body.fromLang ?? "").trim() || "Auto";
    const toLang = (body.toLang ?? "").trim();

    if (!text) {
      return Response.json({ error: "Missing text." }, { status: 400 });
    }
    if (!toLang) {
      return Response.json({ error: "Missing toLang." }, { status: 400 });
    }
    if (fromLang.toLowerCase() === toLang.toLowerCase()) {
      return Response.json({ translation: text, serverMs: 0 });
    }

    const modelId = body.model ?? "llama-3.3-70b-versatile";

    const t0 = performance.now();

    const result = await generateText({
      model: groq(modelId),
      temperature: 0,
      messages: [
        { role: "system", content: buildSystemPrompt(fromLang, toLang) },
        { role: "user", content: text },
      ],
    });

    const serverMs = performance.now() - t0;

    return Response.json({
      translation: result.text.trim(),
      serverMs,
      model: modelId,
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return Response.json(
      { error: err?.message ?? "Translate failed." },
      { status: 500 }
    );
  }
}
