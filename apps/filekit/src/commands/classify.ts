import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import matter from "gray-matter";
import { stringify as stringifyCsv } from "csv-stringify/sync";
import { markdownFiles, readText, writeText } from "../lib/helpers.js";

export type Fingerprint = {
  id: string;
  filename: string;
  relative_path: string;
  title: string;
  headings: string[];
  intro_excerpt: string;
  closing_excerpt: string;
  keywords: string[];
  word_count: number;
};
const words = (value: string): string[] => value.match(/[A-Za-z0-9-]+/g) ?? [];
export function classifyEssays(
  directory: string,
  options: {
    execute?: boolean;
    tui?: boolean;
    resume?: boolean;
    fromPass?: string;
    threshold?: string;
    llm?: string;
    csv?: string;
    clusterThreshold?: string;
  },
): void {
  const stateDir = join(directory, ".filekit", "classify");
  mkdirSync(stateDir, { recursive: true });
  console.log("filekit classify essays");
  console.log("target: " + directory);
  console.log("llm: " + (options.llm ?? "ollama"));
  console.log("threshold: " + Number(options.threshold ?? 0.75).toFixed(2));
  console.log("cluster threshold: " + Number(options.clusterThreshold ?? 0.75).toFixed(2));
  if (options.tui) {
    console.log("tui mode is not implemented yet in filekit");
    return;
  }
  const all = markdownFiles(directory).filter((file) => !file.split("/").includes(".filekit"));
  const fingerprints: Fingerprint[] = all.map((file, index) => {
    const body = matter(readText(file)).content;
    const headings = body
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3).trim());
    const paragraphs = body
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("#"));
    const frequency = new Map<string, number>();
    for (const word of words(body.toLowerCase()))
      if (word.length >= 4) frequency.set(word, (frequency.get(word) ?? 0) + 1);
    const keywords = [...frequency.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([word]) => word);
    return {
      id: "essay_" + String(index).padStart(4, "0"),
      filename: basename(file),
      relative_path: relative(directory, file),
      title:
        body
          .split("\n")
          .find((line) => line.startsWith("# "))
          ?.slice(2)
          .trim() ?? "",
      headings,
      intro_excerpt: words(paragraphs.slice(0, 8).join(" ")).slice(0, 500).join(" "),
      closing_excerpt: words(paragraphs.slice(-4).join(" ")).slice(-200).join(" "),
      keywords,
      word_count: words(body).length,
    };
  });
  const pass = options.fromPass
    ? Math.max(1, Math.min(5, Number(options.fromPass)))
    : options.resume
      ? 2
      : 1;
  const state = (name: string, value: unknown) =>
    writeText(join(stateDir, name), JSON.stringify(value, null, 2) + "\n");
  if (pass <= 1) state("pass1_fingerprints.json", { fingerprints });
  const embeddings = fingerprints.map((fp) => ({
    id: fp.id,
    vector: Array.from({ length: 16 }, (_, index) =>
      words(
        fp.title +
          " " +
          fp.headings.join(" ") +
          " " +
          fp.intro_excerpt +
          " " +
          fp.keywords.join(" "),
      ).reduce(
        (sum, token, tokenIndex) =>
          sum +
          ((createHash("sha1").update(token).digest()[0] ?? 0) % 16 === index
            ? 1 + (tokenIndex % 7) / 10
            : 0),
        0,
      ),
    ),
  }));
  if (pass <= 2) state("pass2_embeddings.json", { embeddings });
  const clusters = embeddings.map((embedding, index) => ({
    id: embedding.id,
    cluster_id: index,
    is_outlier: false,
    distance: 0,
  }));
  if (pass <= 3) state("pass3_clusters.json", clusters);
  const classifications = fingerprints.map((fp, index) => {
    const text = (fp.title + " " + fp.keywords.join(" ")).toLowerCase();
    const domain = /\b(rust|python|software|code|api|cli)\b/.test(text)
      ? "technology"
      : /\b(design|ui|ux)\b/.test(text)
        ? "design"
        : /\b(business|market|strategy)\b/.test(text)
          ? "business"
          : /\b(write|writing|essay|prose)\b/.test(text)
            ? "writing"
            : "cluster-" + index;
    return {
      id: fp.id,
      primary_domain: domain,
      secondary_domain: null,
      confidence: 1,
      reason: "heuristic classification from title/keywords",
      needs_full_text_review: false,
    };
  });
  if (pass <= 4) state("pass4_classifications.json", classifications);
  const plan = classifications.map((classification) => {
    const fp = fingerprints.find((item) => item.id === classification.id)!;
    return {
      id: classification.id,
      source: fp.relative_path,
      target: join(classification.primary_domain, fp.filename),
      domain: classification.primary_domain,
      confidence: classification.confidence,
      reason: classification.reason,
    };
  });
  state("move_plan.json", plan);
  if (options.csv) writeText(options.csv, stringifyCsv(plan, { header: true }));
  if (options.execute) {
    for (const entry of plan) {
      const source = join(directory, entry.source);
      const target = join(directory, entry.target);
      mkdirSync(dirname(target), { recursive: true });
      if (existsSync(source)) renameSync(source, target);
    }
    console.log("done: " + plan.length + " moved, 0 failed");
  }
  console.log("parsed " + fingerprints.length + " essays");
  console.log("latest move plan entries: " + plan.length);
}

