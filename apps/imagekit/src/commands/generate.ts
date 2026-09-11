import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpenRouter } from "@openrouter/sdk";
import { ensureDir, isRegularFile } from "../utils";

const DEFAULT_MODEL = "openai/gpt-5.4-image-2";
const DEFAULT_SYSTEM_PATH = path.join(os.homedir(), ".iconkit", "system.md");

interface GenerateOptions {
  output?: string;
  model?: string;
  system?: string;
  reference?: string[];
}

function loadSystemInstructions(systemPath: string | undefined): string | undefined {
  const p = systemPath ?? DEFAULT_SYSTEM_PATH;
  return isRegularFile(p) ? fs.readFileSync(p, "utf8") : undefined;
}

function toDataUrl(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase() || "png";
  const mime = ext === "jpg" ? "jpeg" : ext;
  return `data:image/${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

export async function cmdGenerate(prompt: string, opts: GenerateOptions): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Error: OPENROUTER_API_KEY environment variable is not set.");
    process.exit(1);
  }

  for (const ref of opts.reference ?? []) {
    if (!isRegularFile(ref)) {
      console.error(`Error: reference file not found: ${ref}`);
      process.exit(1);
    }
  }

  if (opts.system && !isRegularFile(opts.system)) {
    console.error(`Error: system prompt file not found: ${opts.system}`);
    process.exit(1);
  }

  const output = opts.output ?? "icon.png";
  const outDir = path.dirname(path.resolve(output));
  ensureDir(outDir);

  const model = opts.model ?? DEFAULT_MODEL;
  const systemInstructions = loadSystemInstructions(opts.system);
  const references = (opts.reference ?? []).map((ref) => ({
    type: "image_url" as const,
    imageUrl: { url: toDataUrl(ref) },
  }));

  console.log(`Generating icon with ${model}...`);

  const openrouter = new OpenRouter({ apiKey });
  let result: Awaited<ReturnType<typeof openrouter.chat.send>>;
  try {
    result = await openrouter.chat.send({
      chatRequest: {
        model,
        messages: [
          ...(systemInstructions
            ? [{ role: "system" as const, content: systemInstructions }]
            : []),
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: prompt }, ...references],
          },
        ],
        modalities: ["image", "text"],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: OpenRouter request failed: ${message}`);
    process.exit(1);
  }

  if (!("choices" in result)) {
    console.error("Error: unexpected streaming response from OpenRouter.");
    process.exit(1);
  }

  const image = result.choices[0]?.message.images?.[0];
  if (!image) {
    console.error("Error: no image returned by the model.");
    process.exit(1);
  }

  const match = image.imageUrl.url.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) {
    console.error("Error: unexpected image URL format returned by the model.");
    process.exit(1);
  }

  const [, subtype, data] = match;
  const returnedExt = subtype === "jpeg" ? "jpg" : subtype!;
  const requestedExt = path.extname(output).slice(1).toLowerCase();
  const finalOutput =
    requestedExt && requestedExt !== returnedExt
      ? output.slice(0, -requestedExt.length) + returnedExt
      : output;

  fs.writeFileSync(finalOutput, Buffer.from(data!, "base64"));
  if (finalOutput !== output) {
    console.log(`Note: model returned a ${returnedExt} image, not ${requestedExt}`);
  }
  const cost = result.usage?.cost;
  console.log(`Done — wrote ${finalOutput}${cost != null ? ` ($${cost.toFixed(4)})` : ""}`);
}
