import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import express, { type Request, type Response } from "express";
import { generateVideo } from "../generate/generator";

dotenv.config();

const PORT = Number(process.env.PORT ?? 3001);
const UI_PATH = path.join(process.cwd(), "public/ui/index.html");

const app = express();
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  const html = fs.readFileSync(UI_PATH, "utf-8");
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

app.post("/api/generate", async (req: Request, res: Response) => {
  const description = String(req.body?.description ?? "").trim();

  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const unsplashAccessKey = process.env.UNSPLASH_ACCESS_KEY;

  if (!anthropicApiKey || !unsplashAccessKey) {
    const missing = [
      !anthropicApiKey && "ANTHROPIC_API_KEY",
      !unsplashAccessKey && "UNSPLASH_ACCESS_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    res.status(400).json({ error: `Missing environment variables: ${missing}` });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 5000);

  try {
    await generateVideo({
      description,
      anthropicApiKey,
      unsplashAccessKey,
      onProgress: send,
    });
  } catch (err) {
    send({ type: "error", message: String(err) });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

app.options("*", (_req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});

app.listen(PORT, () => {
  console.log(`\n✨  Prompt-to-Video server → http://localhost:${PORT}`);
  console.log(`📺  Remotion Studio       → http://localhost:3000\n`);
});
