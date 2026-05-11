import { AbsoluteFill, Composition, getStaticFiles } from "remotion";
import { AIVideo, aiVideoSchema } from "./components/AIVideo";
import { FPS, INTRO_DURATION } from "./lib/constants";
import { getTimelinePath, loadTimelineFromFile } from "./lib/utils";

const Placeholder: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "#0e0e10",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#fafafa",
      padding: 60,
      textAlign: "center",
    }}
  >
    <div style={{ fontSize: 64 }}>🎬</div>
    <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>
      No videos yet
    </div>
    <div style={{ fontSize: 20, color: "#71717a", lineHeight: 1.6 }}>
      Open the web UI at{" "}
      <span style={{ color: "#6366f1" }}>localhost:3001</span> to generate your
      first video, then refresh this Studio tab.
    </div>
  </AbsoluteFill>
);

export const RemotionRoot: React.FC = () => {
  const staticFiles = getStaticFiles();
  const timelines = staticFiles
    .filter((file) => file.name.endsWith("timeline.json"))
    .map((file) => file.name.split("/")[1]);

  return (
    <>
      {timelines.length === 0 && (
        <Composition
          id="NoVideosYet"
          component={Placeholder}
          fps={FPS}
          width={1080}
          height={1920}
          durationInFrames={FPS * 5}
          defaultProps={{}}
        />
      )}
      {timelines.map((storyName) => (
        <Composition
          id={storyName}
          component={AIVideo}
          fps={FPS}
          width={1080}
          height={1920}
          schema={aiVideoSchema}
          defaultProps={{
            timeline: null,
          }}
          calculateMetadata={async ({ props }) => {
            const { lengthFrames, timeline } = await loadTimelineFromFile(
              getTimelinePath(storyName),
            );

            return {
              durationInFrames: lengthFrames + INTRO_DURATION,
              props: {
                ...props,
                timeline,
              },
            };
          }}
        />
      ))}
    </>
  );
};
