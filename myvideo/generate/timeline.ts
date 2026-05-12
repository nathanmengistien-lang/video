import type {
  BackgroundElement,
  ElementAnimation,
  StoryMetadataWithDetails,
  TextElement,
  Timeline,
} from "../src/types";

const WORDS_PER_SECOND = 2.5;
const MIN_SLIDE_MS = 3000;
const MAX_CHUNK_CHARS = 14;

function slideDurationMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_SLIDE_MS, Math.ceil((words / WORDS_PER_SECOND) * 1000));
}

function splitIntoChunks(text: string): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + word).length > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += `${word} `;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function getBgAnimations(durationMs: number, zoomIn: boolean): ElementAnimation[] {
  return [
    {
      type: "scale",
      from: zoomIn ? 1.5 : 1,
      to: zoomIn ? 1 : 1.5,
      startMs: 0,
      endMs: durationMs,
    },
  ];
}

function getTextAnimations(): ElementAnimation[] {
  const durationMs = 300;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rand = () => (Math as any).random();
  const startScale = rand() * 0.2 + 0.5;
  const dontScale = rand() > 0.6;
  const bounces = rand() > 0.5;

  const anims: ElementAnimation[] = [
    {
      type: "scale",
      from: dontScale ? 1 : startScale,
      to: bounces ? 1.25 : 1,
      startMs: 0,
      endMs: durationMs,
    },
  ];

  if (bounces) {
    anims.push({ type: "scale", from: 1.25, to: 1, startMs: durationMs, endMs: durationMs + 200 });
  }

  return anims;
}

export const createTimeline = (story: StoryMetadataWithDetails): Timeline => {
  const timeline: Timeline = {
    elements: [],
    text: [],
    audio: [],
    shortTitle: story.shortTitle,
  };

  let durationMs = 0;
  let zoomIn = true;

  for (const content of story.content) {
    const lenMs = slideDurationMs(content.text);

    const bgElem: BackgroundElement = {
      startMs: durationMs,
      endMs: durationMs + lenMs,
      imageUrl: content.uid,
      enterTransition: "blur",
      exitTransition: "blur",
      animations: getBgAnimations(lenMs, zoomIn),
    };
    timeline.elements.push(bgElem);

    const chunks = splitIntoChunks(content.text);
    chunks.forEach((chunk, ci) => {
      const textElem: TextElement = {
        startMs: durationMs + Math.round((ci / chunks.length) * lenMs),
        endMs: durationMs + Math.round(((ci + 1) / chunks.length) * lenMs),
        text: chunk,
        position: "center",
        animations: getTextAnimations(),
      };
      timeline.text.push(textElem);
    });

    durationMs += lenMs;
    zoomIn = !zoomIn;
  }

  return timeline;
};
