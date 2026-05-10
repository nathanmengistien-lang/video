import z from "zod";
import * as fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { CharacterAlignmentResponseModel } from "@elevenlabs/elevenlabs-js/api";
import { IMAGE_HEIGHT, IMAGE_WIDTH } from "../src/lib/constants";
import { zodToJsonSchema } from "zod-to-json-schema";

let anthropicApiKey: string | null = null;
let unsplashAccessKey: string | null = null;

export const setAnthropicApiKey = (key: string) => {
  anthropicApiKey = key;
};

export const setUnsplashAccessKey = (key: string) => {
  unsplashAccessKey = key;
};

export const claudeStructuredCompletion = async <T>(
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = zodToJsonSchema(schema) as any;

  const client = new Anthropic({ apiKey: anthropicApiKey! });

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    tools: [
      {
        name: "structured_output",
        description: "Return the result in the required structured format",
        input_schema: {
          type: "object" as const,
          properties: jsonSchema.properties ?? {},
          required: jsonSchema.required ?? [],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: "tool", name: "structured_output" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  if (!toolUse) {
    throw new Error("No structured output returned by Claude");
  }

  return schema.parse(toolUse.input);
};

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "with",
  "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "this", "that", "its", "their", "from", "into", "by", "as",
]);

function fallbackQuery(query: string): string {
  const word = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .find((w) => w.length > 3 && !STOP_WORDS.has(w));
  return word ?? query.split(/\s+/)[0];
}

async function unsplashSearch(q: string): Promise<string | null> {
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=portrait&per_page=1`,
    { headers: { Authorization: `Client-ID ${unsplashAccessKey}` } },
  );
  if (!res.ok) throw new Error(`Unsplash search error: ${await res.text()}`);
  const data = await res.json();
  const photo = data.results?.[0];
  return photo ? photo.urls.raw : null;
}

export const fetchUnsplashImage = async ({
  query,
  path,
  onRetry,
}: {
  query: string;
  path: string;
  onRetry: (attempt: number) => void;
}) => {
  const maxRetries = 3;
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      let rawUrl = await unsplashSearch(query);

      if (!rawUrl) {
        const simple = fallbackQuery(query);
        rawUrl = await unsplashSearch(simple);
      }

      if (!rawUrl) {
        throw new Error(`No Unsplash results for query: "${query}"`);
      }

      const imageUrl = `${rawUrl}&w=${IMAGE_WIDTH}&h=${IMAGE_HEIGHT}&fit=crop&auto=format`;
      const imageRes = await fetch(imageUrl);

      if (!imageRes.ok) {
        throw new Error(`Unsplash image download error: ${imageRes.status}`);
      }

      const buffer = Buffer.from(await imageRes.arrayBuffer());
      fs.writeFileSync(path, buffer);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      attempt++;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        onRetry(attempt);
      }
    }
  }

  throw lastError!;
};

export const getTitleFromDescription = async (
  description: string,
): Promise<string> => {
  const result = await claudeStructuredCompletion(
    `Generate a short, catchy title (5 words max, no quotes) for a video described as: "${description}"`,
    z.object({ title: z.string() }),
  );
  return result.title;
};

export const getGenerateStoryPrompt = (title: string, topic: string) => {
  const prompt = `Write a short story with title [${title}] (its topic is [${topic}]).
   You must follow best practices for great storytelling.
   The script must be 8-10 sentences long.
   Story events can be from anywhere in the world, but text must be translated into English language.
   Result result without any formatting and title, as one continuous text.
   Skip new lines.`;

  return prompt;
};

export const getGenerateImageDescriptionPrompt = (storyText: string) => {
  const prompt = `You are given story text.
  Generate (in English) 5-8 very detailed image descriptions  for this story.
  Return their description as json array with story sentences matched to images.
  Story sentences must be in the same order as in the story and their content must be preserved.
  Each image must match 1-2 sentence from the story.
  Images must show story content in a way that is visually appealing and engaging, not just characters.
  Give output in json format:

  [
    {
      "text": "....",
      "imageDescription": "..."
    }
  ]

  <story>
  ${storyText}
  </story>`;

  return prompt;
};

const saveBase64ToMp3 = (data: string, path: string) => {
  const buffer = Buffer.from(data, "base64");
  fs.writeFileSync(path, buffer as Uint8Array);
};

export const generateVoice = async (
  text: string,
  apiKey: string,
  path: string,
): Promise<CharacterAlignmentResponseModel> => {
  const client = new ElevenLabsClient({
    environment: "https://api.elevenlabs.io",
    apiKey,
  });

  const voiceId = "21m00Tcm4TlvDq8ikWAM";

  const data = await client.textToSpeech.convertWithTimestamps(voiceId, {
    text,
  });

  if (!data.alignment || !data.alignment.characterEndTimesSeconds.length) {
    throw new Error("ElevenLabs response missing timestamps");
  }

  saveBase64ToMp3(data.audioBase64, path);
  return data.alignment;
};
