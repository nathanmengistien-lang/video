import {
  generateAiImage,
  generateVoice,
  getGenerateImageDescriptionPrompt,
  getGenerateStoryPrompt,
  getTitleFromDescription,
  openaiStructuredCompletion,
  setApiKey,
} from "./service";
import {
  StoryMetadataWithDetails,
  StoryScript,
  StoryWithImages,
  Timeline,
} from "../src/lib/types";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { createTimeLineFromStoryWithDetails } from "./timeline";

export type ProgressEvent =
  | { type: "status"; message: string; step?: number; total?: number }
  | { type: "done"; slug: string; title: string }
  | { type: "error"; message: string };

class ContentFS {
  title: string;
  slug: string;

  constructor(title: string) {
    this.title = title;
    this.slug = this.getSlug();
  }

  saveDescriptor(descriptor: StoryMetadataWithDetails) {
    const filePath = path.join(this.getDir(), "descriptor.json");
    fs.writeFileSync(filePath, JSON.stringify(descriptor, null, 2));
  }

  saveTimeline(timeline: Timeline) {
    const filePath = path.join(this.getDir(), "timeline.json");
    fs.writeFileSync(filePath, JSON.stringify(timeline, null, 2));
  }

  getDir(dir?: string): string {
    const segments = ["public", "content", this.slug];
    if (dir) segments.push(dir);
    const p = path.join(process.cwd(), ...segments);
    fs.mkdirSync(p, { recursive: true });
    return p;
  }

  getImagePath(uid: string): string {
    return path.join(this.getDir("images"), `${uid}.png`);
  }

  getAudioPath(uid: string): string {
    return path.join(this.getDir("audio"), `${uid}.mp3`);
  }

  getSlug(): string {
    return this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}

export async function generateVideoFromDescription({
  description,
  apiKey,
  elevenlabsApiKey,
  onProgress,
}: {
  description: string;
  apiKey: string;
  elevenlabsApiKey: string;
  onProgress: (event: ProgressEvent) => void;
}): Promise<void> {
  setApiKey(apiKey);

  onProgress({ type: "status", message: "Generating title from description…" });
  const title = await getTitleFromDescription(description);

  onProgress({
    type: "status",
    message: `Writing story: "${title}"…`,
  });
  const storyRes = await openaiStructuredCompletion(
    getGenerateStoryPrompt(title, description),
    StoryScript,
  );

  onProgress({ type: "status", message: "Creating image descriptions…" });
  const storyWithImagesRes = await openaiStructuredCompletion(
    getGenerateImageDescriptionPrompt(storyRes.text),
    StoryWithImages,
  );

  const storyWithDetails: StoryMetadataWithDetails = {
    shortTitle: title,
    content: storyWithImagesRes.result.map((item) => ({
      text: item.text,
      imageDescription: item.imageDescription,
      uid: uuidv4(),
      audioTimestamps: {
        characters: [],
        characterStartTimesSeconds: [],
        characterEndTimesSeconds: [],
      },
    })),
  };

  const contentFs = new ContentFS(title);
  contentFs.saveDescriptor(storyWithDetails);

  const total = storyWithDetails.content.length * 2;
  for (let i = 0; i < storyWithDetails.content.length; i++) {
    const storyItem = storyWithDetails.content[i];

    onProgress({
      type: "status",
      message: `Generating image ${i + 1} of ${storyWithDetails.content.length}…`,
      step: i * 2 + 1,
      total,
    });
    await generateAiImage({
      prompt: storyItem.imageDescription,
      path: contentFs.getImagePath(storyItem.uid),
      onRetry: (attempt) => {
        onProgress({
          type: "status",
          message: `Retrying image ${i + 1} (attempt ${attempt + 1})…`,
          step: i * 2 + 1,
          total,
        });
      },
    });

    onProgress({
      type: "status",
      message: `Generating voice ${i + 1} of ${storyWithDetails.content.length}…`,
      step: i * 2 + 2,
      total,
    });
    storyItem.audioTimestamps = await generateVoice(
      storyItem.text,
      elevenlabsApiKey,
      contentFs.getAudioPath(storyItem.uid),
    );
  }

  contentFs.saveDescriptor(storyWithDetails);

  onProgress({ type: "status", message: "Building timeline…" });
  const timeline = createTimeLineFromStoryWithDetails(storyWithDetails);
  contentFs.saveTimeline(timeline);

  onProgress({ type: "done", slug: contentFs.slug, title });
}
