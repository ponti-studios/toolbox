import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { tmpdir } from "os";
import { join } from "path";
import { getSkillPath, getSkillsDirs } from "./skills";

const originalHome = process.env.HOME;

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

describe("skill resolution", () => {
  it("searches .agents before .codex and prefers direct names", () => {
    const home = mkdtempSync(join(tmpdir(), "monotone-skills-"));
    process.env.HOME = home;

    const agentsSkill = join(home, ".agents", "skills", "write-essay");
    const codexSkill = join(home, ".codex", "skills", "write-essay");
    mkdirSync(agentsSkill, { recursive: true });
    mkdirSync(codexSkill, { recursive: true });
    writeFileSync(join(agentsSkill, "SKILL.md"), "agents");
    writeFileSync(join(codexSkill, "SKILL.md"), "codex");

    assert.deepEqual(getSkillsDirs(), [join(home, ".agents", "skills"), join(home, ".codex", "skills")]);
    assert.equal(getSkillPath("write-essay"), join(agentsSkill, "SKILL.md"));
  });

  it("finds kernel-prefixed aliases", () => {
    const home = mkdtempSync(join(tmpdir(), "monotone-skills-"));
    process.env.HOME = home;

    const skill = join(home, ".codex", "skills", "kernel-extract-posts");
    mkdirSync(skill, { recursive: true });
    writeFileSync(join(skill, "SKILL.md"), "extract");

    assert.equal(getSkillPath("extract-posts"), join(skill, "SKILL.md"));
  });
});
