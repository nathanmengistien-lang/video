import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  claudeStructuredCompletion,
  fetchUnsplashImage,
  getGenerateImageDescriptionPrompt,
  getGenerateStoryPrompt,
  getTitleFromDescription,
  setAnthropicApiKey,
  setUnsplashAccessKey,
} from "./service";
import { StoryScript, StoryWithImages, type StoryMetadataWithDetails, type Timeline } from "../src/types";
import { createTimeline } from "./timeline";

export type ProgressEvent =
  | { type: "status"; message: string; step?: number; total?: number }
  | { type: "done"; slug: string; title: string }
  | { type: "error"; message: string };

class ContentFS {
  slug: string;

  constructor(public title: string) {
    this.slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  getDir(sub?: string): string {
    const p = path.join(process.cwd(), "public", "content", this.slug, ...(sub ? [sub] : []));
    fs.mkdirSync(p, { recursive: true });
    return p;
  }

  getImagePath(uid: string): string {
    return path.join(this.getDir("images"), `${uid}.png`);
  }

  save(filename: string, data: object) {
    fs.writeFileSync(path.join(this.getDir(), filename), JSON.stringify(data, null, 2));
  }
}

export async function generateVideo({
  description,
  anthropicApiKey,
  unsplashAccessKey,
  onProgress,
}: {
  description: string;
  anthropicApiKey: string;
  unsplashAccessKey: string;
  onProgress: (event: ProgressEvent) => void;
}): Promise<void> {
  setAnthropicApiKey(anthropicApiKey);
  setUnsplashAccessKey(unsplashAccessKey);

  onProgress({ type: "status", message: "Generating title…" });
  const title = await getTitleFromDescription(description);

  onProgress({ type: "status", message: `Writing story: "${title}"…` });
  const storyRes = await claudeStructuredCompletion(
    getGenerateStoryPrompt(title, description),
    StoryScript,
  );

  onProgress({ type: "status", message: "Creating image descriptions…" });
  const withImages = await claudeStructuredCompletion(
    getGenerateImageDescriptionPrompt(storyRes.text),
    StoryWithImages,
  );

  const story: StoryMetadataWithDetails = {
    shortTitle: title,
    content: withImages.result.map((item) => ({
      text: item.text,
      imageDescription: item.imageDescription,
      uid: uuidv4(),
    })),
  };

  const cfs = new ContentFS(title);
  cfs.save("descriptor.json", story);

  const total = story.content.length;
  for (let i = 0; i < total; i++) {
    const item = story.content[i];
    onProgress({ type: "status", message: `Fetching image ${i + 1} of ${total}…`, step: i + 1, total });
    await fetchUnsplashImage({
      query: item.imageDescription,
      path: cfs.getImagePath(item.uid),
      onRetry: (attempt) => {
        onProgress({ type: "status", message: `Retrying image ${i + 1} (attempt ${attempt + 1})…`, step: i + 1, total });
      },
    });
  }

  onProgress({ type: "status", message: "Building timeline…" });
  const timeline: Timeline = createTimeline(story);
  cfs.save("timeline.json", timeline);

  onProgress({ type: "done", slug: cfs.slug, title });
}
