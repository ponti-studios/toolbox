import { join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const AGENTS_SKILLS = join(HOME, ".agents", "skills");

export function getSkillPath(name: string): string {
  // Try direct name first, then kernel-prefixed variant
  const direct = join(AGENTS_SKILLS, name, "SKILL.md");
  if (existsSync(direct)) return direct;
  
  const prefixed = join(AGENTS_SKILLS, `kernel-${name}`, "SKILL.md");
  if (existsSync(prefixed)) return prefixed;
  
  return direct;
}

export function loadSkill(name: string): string {
  const skillPath = getSkillPath(name);
  const dir = skillPath.replace(/\/SKILL\.md$/, "");
  
  let content = readFileSync(skillPath, "utf-8");
  
  // Load referenced files
  const refsDir = join(dir, "references");
  if (existsSync(refsDir)) {
    for (const ref of readdirSync(refsDir)) {
      if (ref.endsWith(".md")) {
        content += "\n\n---\n\n" + readFileSync(join(refsDir, ref), "utf-8");
      }
    }
  }
  
  return content;
}

export function getSkillsDir(): string {
  return AGENTS_SKILLS;
}
