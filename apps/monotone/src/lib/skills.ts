import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || "~";
}

export function getSkillsDirs(): string[] {
  const home = homeDir();
  return [join(home, ".agents", "skills"), join(home, ".codex", "skills")];
}

export function getSkillPath(name: string): string | undefined {
  const candidates = name.startsWith("kernel-") ? [name, name.replace(/^kernel-/, "")] : [name, `kernel-${name}`];

  for (const dir of getSkillsDirs()) {
    for (const candidate of candidates) {
      const path = join(dir, candidate, "SKILL.md");
      if (existsSync(path)) return path;
    }
  }

  return undefined;
}

export function loadSkill(name: string): string {
  const skillPath = getSkillPath(name);
  if (!skillPath) {
    throw new Error(`Skill not found: ${name}. Searched ${getSkillsDirs().join(", ")}`);
  }

  const dir = dirname(skillPath);

  let content = readFileSync(skillPath, "utf-8");

  // Load referenced files
  const refsDir = join(dir, "references");
  if (existsSync(refsDir)) {
    for (const ref of readdirSync(refsDir).sort()) {
      if (ref.endsWith(".md")) {
        content += "\n\n---\n\n" + readFileSync(join(refsDir, ref), "utf-8");
      }
    }
  }

  return content;
}

export function getSkillsDir(): string {
  return getSkillsDirs()[0] ?? join(homeDir(), ".agents", "skills");
}
