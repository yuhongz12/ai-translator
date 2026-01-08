// app/api/translate/route.ts
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Initialize Groq client
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  const { prompt, language } = await req.json();

  const result = streamText({
    model: groq('llama-3.1-8b-instant'), // The "speed demon" model
    system: "You are a fast translator. Output ONLY the translated text. No preamble.",
    prompt: `Translate this to ${language}: ${prompt}`,
  });

  return result.toUIMessageStreamResponse();
}
