import { join } from "path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const AGENTS_SKILLS = join(HOME, ".agents", "skills");

export function getSkillPath(name: string): string {
  const path = join(AGENTS_SKILLS, name, "SKILL.md");
  return path;
}

export function getSkillsDir(): string {
  return AGENTS_SKILLS;
}
