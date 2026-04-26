import { describe, it, expect } from "vitest";
import { buildIterationPrompt } from "./iteration-prompt.js";
import { CONVENTIONAL_COMMIT_MESSAGE } from "../core/commit-message.js";

describe("buildIterationPrompt", () => {
  it("includes the iteration number", () => {
    const result = buildIterationPrompt({
      n: 3,
      runId: "test-run-123",
      prompt: "fix all bugs",
    });
    expect(result).toContain("This is iteration 3.");
  });

  it("includes the run ID in the notes path", () => {
    const result = buildIterationPrompt({
      n: 1,
      runId: "my-run-abc",
      prompt: "do stuff",
    });
    expect(result).toContain("`.gnhf/runs/my-run-abc/notes.md`");
  });

  it("includes notes size metadata when provided", () => {
    const result = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "do stuff",
      notesMetadata: { lineCount: 12, wordCount: 34 },
    });
    expect(result).toContain("`notes.md`: 12 lines, 34 words.");
  });

  it("includes the objective prompt at the end", () => {
    const prompt = "improve test coverage";
    const result = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt,
    });
    expect(result).toContain("## Objective");
    expect(result.trimEnd().endsWith(prompt)).toBe(true);
  });

  it("includes enhanced instructions about reading notes and choosing cohesive outcomes by default", () => {
    const result = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "test",
    });
    expect(result).toContain(
      "Review `.gnhf/runs/run-1/notes.md` first to understand previous iterations",
    );
    expect(result).toContain(
      "format: `N:` summary | `+` change | `?` learning",
    );
    expect(result).toContain("Prefer one substantial, cohesive slice");
    expect(result).toContain("broadest cohesive objective slice");
    expect(result).toContain("not first location/symptom found");
    expect(result).toContain("scan the chosen boundary once");
    expect(result).not.toContain("smallest logical unit");
  });

  it("can build the original iteration prompt", () => {
    const result = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "test",
      original: true,
    });
    expect(result).toContain(
      "make an incremental step forward, not to complete the entire objective",
    );
    expect(result).toContain("smallest logical unit");
    expect(result).not.toContain("broadest cohesive objective slice");
  });

  it("instructs agents to submit structured output only after cleanup and final verification", () => {
    const result = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "test",
    });
    expect(result).toContain("Only submit the final JSON object after");
    expect(result).toContain("stopped any background processes");
  });

  it("asks agents to keep structured output terse", () => {
    const result = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "test",
    });
    expect(result).toContain(
      "Only final assistant message must be raw schema-matching JSON.",
    );
    expect(result).toContain("No interim JSON required");
    expect(result).toContain("Non-final JSON may contain dummy/placeholders");
    expect(result).toContain(
      "Goal: concise yet accurate and complete `notes.md` handoff memory",
    );
    expect(result).toContain("summary: a concise one-sentence summary");
    expect(result).toContain("no dummy placeholders");
    expect(result).toContain("don't group this by file");
    expect(result).toContain("success=false -> []");
    expect(result).toContain("new learnings that were surprising");
    expect(result).toContain("obvious context, stale blockers");
    expect(result).toContain("Pattern: `thing action -> reason/effect`");
    expect(result).toContain("Prefer one clear fact per note");
    expect(result).toContain("Omit validation results");
  });

  it("shares output instructions between original and revised prompts", () => {
    const original = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "test",
      original: true,
    });
    const revised = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "test",
    });
    const originalOutput = original.split("## Output\n\n")[1]!.split(
      "\n\n## Objective",
    )[0];
    const revisedOutput = revised.split("## Output\n\n")[1]!.split(
      "\n\n## Objective",
    )[0];
    expect(originalOutput).toBe(revisedOutput);
  });

  it("produces a prompt identical to the default when stopWhen is not set", () => {
    const baseline = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "do stuff",
    });
    const withUndefined = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "do stuff",
      stopWhen: undefined,
    });
    expect(withUndefined).toBe(baseline);
    expect(baseline).not.toContain("should_fully_stop");
    expect(baseline).not.toContain("Stop Condition");
  });

  it("injects a stop condition section and should_fully_stop output field when stopWhen is set", () => {
    const result = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "do stuff",
      stopWhen: "all tasks are done",
    });
    expect(result).toContain("Stop Condition");
    expect(result).toContain("all tasks are done");
    expect(result).toContain("should_fully_stop");
    expect(result).toContain("default to false");
    expect(result).not.toContain("omit should_fully_stop");
  });

  it("adds commit message field instructions when the convention requires them", () => {
    const result = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "do stuff",
      commitMessage: CONVENTIONAL_COMMIT_MESSAGE,
    });

    expect(result).toContain("type: Commit type");
    expect(result).toContain(
      "allowed values: build, ci, docs, feat, fix, perf, refactor, test, chore",
    );
    expect(result).toContain('default: "chore"');
    expect(result).toContain("scope: Optional commit scope");
    expect(result).toContain('default: ""');
  });

  it("warns the agent that complete no-op iterations should report success=false", () => {
    // Without this guardrail, an agent that converges (no further useful
    // work) keeps reporting success=true with empty key_changes_made,
    // which the orchestrator can't distinguish from a productive
    // iteration and the loop spins forever.
    const result = buildIterationPrompt({
      n: 1,
      runId: "run-1",
      prompt: "test",
    });
    expect(result).toContain("complete no-op iteration");
    expect(result).toContain("success=false");
  });
});
