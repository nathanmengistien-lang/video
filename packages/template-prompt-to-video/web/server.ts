#!/usr/bin/env bun

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { generateVideoFromDescription } from "../cli/generator";

dotenv.config({ quiet: true });

const PORT = Number(process.env.PORT || 3001);

const UI_HTML_PATH = path.join(import.meta.dir, "../public/ui/index.html");

function serveStaticFile(filePath: string): Response {
  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const contentType: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".json": "application/json",
    };
    return new Response(content, {
      headers: { "Content-Type": contentType[ext] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/" && req.method === "GET") {
      return serveStaticFile(UI_HTML_PATH);
    }

    if (url.pathname === "/api/generate" && req.method === "POST") {
      let description: string;
      try {
        const body = await req.json();
        description = String(body.description ?? "").trim();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      if (!description) {
        return new Response(
          JSON.stringify({ error: "description is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      const unsplashAccessKey = process.env.UNSPLASH_ACCESS_KEY;
      const elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;

      if (!anthropicApiKey || !unsplashAccessKey || !elevenlabsApiKey) {
        const missing = [
          !anthropicApiKey && "ANTHROPIC_API_KEY",
          !unsplashAccessKey && "UNSPLASH_ACCESS_KEY",
          !elevenlabsApiKey && "ELEVENLABS_API_KEY",
        ]
          .filter(Boolean)
          .join(", ");
        return new Response(
          JSON.stringify({
            error: `Missing environment variables: ${missing}. Set them in .env or your shell.`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: object) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
            );
          };

          try {
            await generateVideoFromDescription({
              description,
              anthropicApiKey,
              unsplashAccessKey,
              elevenlabsApiKey,
              onProgress: send,
            });
          } catch (err) {
            send({ type: "error", message: String(err) });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`\n✨  Prompt-to-Video server running at http://localhost:${server.port}`);
console.log(`📺  After generating, preview in Remotion Studio at http://localhost:3000\n`);
