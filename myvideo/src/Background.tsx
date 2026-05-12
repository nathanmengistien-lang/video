import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, IMAGE_HEIGHT, IMAGE_WIDTH } from "./constants";
import type { BackgroundElement } from "./types";
import { calculateBlur, getImagePath } from "./utils";

const EXTRA_SCALE = 0.2;

export const Background: React.FC<{
  item: BackgroundElement;
  project: string;
}> = ({ item, project }) => {
  const frame = useCurrentFrame();
  const localMs = (frame / FPS) * 1000;
  const { width, height } = useVideoConfig();

  const imageRatio = IMAGE_HEIGHT / IMAGE_WIDTH;
  const imgWidth = height;
  const imgHeight = imgWidth * imageRatio;
  let animScale = 1 + EXTRA_SCALE;

  const currentScaleAnim = item.animations?.find(
    (anim) =>
      anim.type === "scale" && anim.startMs <= localMs && anim.endMs >= localMs,
  );

  if (currentScaleAnim) {
    const progress =
      (localMs - currentScaleAnim.startMs) /
      (currentScaleAnim.endMs - currentScaleAnim.startMs);
    animScale =
      EXTRA_SCALE +
      progress * (currentScaleAnim.to - currentScaleAnim.from) +
      currentScaleAnim.from;
  }

  const top = -(imgHeight * animScale - height) / 2;
  const left = -(imgWidth * animScale - width) / 2;
  const blur = calculateBlur({ item, localMs });
  const currentBlur = 25 * blur;

  return (
    <AbsoluteFill>
      <Img
        src={staticFile(getImagePath(project, item.imageUrl))}
        style={{
          width: imgWidth * animScale,
          height: imgHeight * animScale,
          position: "absolute",
          top,
          left,
          filter: `blur(${currentBlur}px)`,
          WebkitFilter: `blur(${currentBlur}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
