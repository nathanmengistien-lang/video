import type {
  BackgroundElement,
  ElementAnimation,
  StoryMetadataWithDetails,
  TextElement,
  Timeline,
} from "../src/lib/types";

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

export const createTimeLineFromStoryWithDetails = (
  storyWithDetails: StoryMetadataWithDetails,
): Timeline => {
  const timeline: Timeline = {
    elements: [],
    text: [],
    audio: [],
    shortTitle: storyWithDetails.shortTitle,
  };

  let durationMs = 0;
  let zoomIn = true;

  for (let i = 0; i < storyWithDetails.content.length; i++) {
    const content = storyWithDetails.content[i];
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
      const chunkStart =
        durationMs + Math.round((ci / chunks.length) * lenMs);
      const chunkEnd =
        durationMs + Math.round(((ci + 1) / chunks.length) * lenMs);
      const textElem: TextElement = {
        startMs: chunkStart,
        endMs: chunkEnd,
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

export function findAllSpaceIndexes(str: string) {
  const indexes = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === " ") {
      indexes.push(i);
    }
  }
  return indexes;
}

export const getBgAnimations = (durationMs: number, zoomIn: boolean) => {
  const animations: ElementAnimation[] = [];

  animations.push({
    type: "scale",
    from: zoomIn ? 1.5 : 1,
    to: zoomIn ? 1 : 1.5,
    startMs: 0,
    endMs: durationMs,
  });

  return animations;
};

export const getTextAnimations = () => {
  const animations: ElementAnimation[] = [];

  const durationMs = 300;

  // eslint-disable-next-line @remotion/deterministic-randomness
  const startScale = Math.random() * 0.2 + 0.5;
  // eslint-disable-next-line @remotion/deterministic-randomness
  const dontScale = Math.random() > 0.6;
  // eslint-disable-next-line @remotion/deterministic-randomness
  const bounces = Math.random() > 0.5;

  animations.push({
    type: "scale",
    from: dontScale ? 1 : startScale,
    to: bounces ? 1.25 : 1,
    startMs: 0,
    endMs: durationMs,
  });

  if (bounces) {
    animations.push({
      type: "scale",
      from: 1.25,
      to: 1,
      startMs: durationMs,
      endMs: durationMs + 200,
    });
  }

  return animations;
};
