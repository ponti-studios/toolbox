export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Deepgram Flux voice catalog (36 English voices across 7 accents).
export const FLUX_VOICES: {
  voice: string;
  accent: string;
  gender: string;
  age: string;
  character: string;
  uses: string;
}[] = [
  {
    voice: "hannah",
    accent: "American",
    gender: "Female",
    age: "Young",
    character: "Clear, confident, thoughtful, pleasant, nice",
    uses: "Casual chat, storytelling",
  },
  {
    voice: "kit",
    accent: "British",
    gender: "Male",
    age: "Young Adult",
    character: "Friendly, energetic, thoughtful, calm, helpful",
    uses: "Customer service, narration, financial services",
  },
  {
    voice: "alexis",
    accent: "American",
    gender: "Female",
    age: "Adult",
    character: "Clear, professional, calm, caring, empathetic",
    uses: "Customer service, IVR, financial services",
  },
  {
    voice: "cliff",
    accent: "American",
    gender: "Male",
    age: "Mature",
    character: "Deep, confident, calm, raspy, clear",
    uses: "Financial services, narration, customer service",
  },
  {
    voice: "sienna",
    accent: "American",
    gender: "Female",
    age: "Young Adult",
    character: "Clear, professional, calm, warm, caring",
    uses: "Customer service, financial services, narration",
  },
  {
    voice: "cole",
    accent: "American",
    gender: "Male",
    age: "Young",
    character: "Friendly, clear, interesting, energetic, engaging",
    uses: "Customer service, IVR",
  },
  {
    voice: "brooke",
    accent: "American",
    gender: "Female",
    age: "Young",
    character: "Friendly, intelligent, fast, confident, energetic",
    uses: "Healthcare, financial services, casual chat",
  },
  {
    voice: "colin",
    accent: "British",
    gender: "Male",
    age: "Adult",
    character: "Warm, friendly, trustworthy, confident, authoritative",
    uses: "Customer service, financial services, narration",
  },
  {
    voice: "gemma",
    accent: "British",
    gender: "Female",
    age: "Young",
    character: "Friendly, kind, approachable, caring, happy",
    uses: "Customer service, IVR",
  },
  {
    voice: "haley",
    accent: "American",
    gender: "Female",
    age: "Young Adult",
    character: "Clear, professional, caring, calm, empathetic",
    uses: "Customer service, financial services, IVR",
  },
  {
    voice: "heather",
    accent: "American",
    gender: "Female",
    age: "Young",
    character: "Clear, engaging, energetic, friendly, thoughtful",
    uses: "Customer service, IVR",
  },
  {
    voice: "miles",
    accent: "American",
    gender: "Male",
    age: "Adult",
    character: "Clear, calm, professional, confident, sincere",
    uses: "Customer service, financial services, informative",
  },
  {
    voice: "sean",
    accent: "British",
    gender: "Male",
    age: "Mature",
    character: "Friendly, kind, caring, calming",
    uses: "IVR",
  },
  {
    voice: "bree",
    accent: "American",
    gender: "Female",
    age: "Mature",
    character: "Friendly, sweet, kind",
    uses: "Customer service, casual chat",
  },
  {
    voice: "brittany",
    accent: "American",
    gender: "Female",
    age: "Mature",
    character: "Confident, kind, soft",
    uses: "Casual chat",
  },
  {
    voice: "bruce",
    accent: "American",
    gender: "Male",
    age: "Adult",
    character: "Friendly, kind, natural, believable, engaged",
    uses: "Customer service, IVR",
  },
  {
    voice: "conor",
    accent: "British",
    gender: "Male",
    age: "Mature",
    character: "Confident, deep, friendly, relaxed",
    uses: "Customer service, IVR",
  },
  {
    voice: "donovan",
    accent: "American",
    gender: "Male",
    age: "Adult",
    character: "Professional, calm, thoughtful",
    uses: "IVR",
  },
  {
    voice: "drew",
    accent: "American",
    gender: "Male",
    age: "Adult",
    character: "Confident, relaxed, soft, young, calm",
    uses: "Healthcare, financial services, customer service, IVR",
  },
  {
    voice: "elise",
    accent: "American",
    gender: "Female",
    age: "Adult",
    character: "Clear, professional, calm, caring, empathetic",
    uses: "Customer service, financial services, IVR",
  },
  {
    voice: "jack",
    accent: "British",
    gender: "Male",
    age: "Adult",
    character: "Confident, thoughtful, friendly, professional, clear",
    uses: "Customer service, storytelling",
  },
  {
    voice: "kai",
    accent: "Singaporean",
    gender: "Male",
    age: "Young Adult",
    character: "Clear, calm, professional, knowledgeable, caring",
    uses: "Customer service, informative, IVR",
  },
  {
    voice: "kelsey",
    accent: "American",
    gender: "Female",
    age: "Young Adult",
    character: "Clear, professional, caring, calm, empathetic",
    uses: "Customer service, IVR, financial services",
  },
  {
    voice: "maeve",
    accent: "Irish",
    gender: "Female",
    age: "Adult",
    character: "Friendly, energetic, confident, gentle, calm",
    uses: "Customer service, IVR, narration",
  },
  {
    voice: "marcelo",
    accent: "Filipino",
    gender: "Male",
    age: "Young Adult",
    character: "Clear, calm, professional, knowledgeable, caring",
    uses: "Customer service, informative, IVR",
  },
  {
    voice: "marcus",
    accent: "American",
    gender: "Male",
    age: "Adult",
    character: "Friendly, helpful, smooth, professional, kind",
    uses: "Customer service, casual chat",
  },
  {
    voice: "meena",
    accent: "Indian",
    gender: "Female",
    age: "Adult",
    character: "Empathetic, professional, calm, reassuring, satisfying",
    uses: "Customer service, casual chat",
  },
  {
    voice: "meghan",
    accent: "American",
    gender: "Female",
    age: "Adult",
    character: "Friendly, nice, energetic, kind, confident",
    uses: "Healthcare, financial services",
  },
  {
    voice: "naveen",
    accent: "Indian",
    gender: "Male",
    age: "Adult",
    character: "Clear, professional, knowledgeable, calm, caring",
    uses: "Customer service, IVR, informative",
  },
  {
    voice: "paige",
    accent: "American",
    gender: "Female",
    age: "Young Adult",
    character: "Clear, professional, calm, comfortable, caring",
    uses: "Customer service, financial services, IVR",
  },
  {
    voice: "priya",
    accent: "Indian",
    gender: "Female",
    age: "Adult",
    character: "Confident, empathetic, professional, calm, reassuring",
    uses: "IVR",
  },
  {
    voice: "rufus",
    accent: "British",
    gender: "Male",
    age: "Adult",
    character: "Friendly, confident, intelligent, gentle, enthusiastic",
    uses: "Healthcare, financial services, storytelling",
  },
  {
    voice: "sharon",
    accent: "Australian",
    gender: "Female",
    age: "Young",
    character: "Formal, calm, relaxed, confident",
    uses: "Healthcare, financial services",
  },
  {
    voice: "tanner",
    accent: "British",
    gender: "Male",
    age: "Adult",
    character: "Professional, calm, confident",
    uses: "Customer service",
  },
  {
    voice: "wade",
    accent: "American",
    gender: "Male",
    age: "Adult",
    character: "Warm, confident, clear, enthusiastic, friendly",
    uses: "Customer service, casual chat",
  },
  {
    voice: "wes",
    accent: "American",
    gender: "Male",
    age: "Adult",
    character: "Thoughtful, friendly, warm, interesting",
    uses: "Customer service, casual chat",
  },
];

export function expandPath(p: string): string {
  let out = p.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (m, name: string) =>
    name in process.env ? process.env[name]! : m,
  );
  if (out === "~" || out.startsWith("~/")) out = (process.env.HOME ?? "") + out.slice(1);
  return out;
}

export function toNarration(md: string): string {
  return md
    .replace(/^---\n[\s\S]*?\n---\n/s, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+] |\d+[.)] )/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/^\s*\|/gm, "")
    .replace(/\|\s*$/gm, "")
    .replace(/^\s*[-:| ]+\n/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function chunkText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  let len = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      current += "\n";
      continue;
    }
    if (len + line.length > maxChars) {
      if (current.trim() !== "") chunks.push(current);
      current = line + "\n";
      len = line.length;
    } else {
      current += line + "\n";
      len += line.length;
    }
  }
  if (current.trim() !== "") chunks.push(current);
  return chunks.filter((c) => c.trim() !== "");
}

export function pcmToWav(pcm: Buffer, rate: number, channels: number): Buffer {
  const byteRate = rate * channels * 2;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// OpenRouter generation records are eventually consistent — poll until populated.
export async function fetchGeneration(gen: string): Promise<Record<string, unknown>> {
  const url = `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(gen)}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const g = (await res.json()) as { data?: Record<string, unknown> };
        const d = g?.data;
        if (d && Object.keys(d).length > 0) return d;
      }
    } catch {
      // retry
    }
    await sleep(1500);
  }
  return {};
}

export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let i = 0;
  const lanes: Promise<void>[] = [];
  for (let c = 0; c < Math.min(concurrency, items.length); c++) {
    lanes.push(
      (async () => {
        for (;;) {
          const idx = i++;
          if (idx >= items.length) return;
          await worker(items[idx], idx);
        }
      })(),
    );
  }
  await Promise.all(lanes);
}
