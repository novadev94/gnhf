import {
  getCommitMessagePromptFields,
  type CommitMessageConfig,
} from "../core/commit-message.js";
import type { NotesMetadata } from "../core/run.js";

interface IterationPromptParams {
  n: number;
  runId: string;
  prompt: string;
  notesMetadata?: NotesMetadata;
  stopWhen?: string;
  commitMessage?: CommitMessageConfig;
}

export function buildIterationPrompt(
  params: IterationPromptParams & { original?: boolean },
): string {
  const outputInstructions = buildOutputInstructions(
    params.stopWhen,
    params.commitMessage,
  );
  const stopConditionSection = buildStopConditionSection(params.stopWhen);
  return params.original
    ? buildOriginalIterationPrompt(
        params,
        outputInstructions,
        stopConditionSection,
      )
    : buildRevisedIterationPrompt(
        params,
        outputInstructions,
        stopConditionSection,
      );
}

const ORIGINAL_OUTPUT_FIELD_PREFIXES = {
  success:
    "- success: whether you were able to make a meaningful contribution that got us closer towards the objective. setting this to false means any code change you made should be discarded. A complete no-op iteration (no file changes AND no new meaningful learnings worth recording) is not a success - set success=false so the run can halt rather than spin on no-op iterations",
  summary:
    "- summary: a concise one-sentence summary of the accomplishment in this iteration",
  keyChanges:
    "- key_changes_made: an array of descriptions for key changes you made. don't group this by file - group by logical units of work. don't describe activities - describe material outcomes",
  keyLearnings:
    "- key_learnings: an array of new learnings that were surprising, weren't captured by previous notes and would be informative for future iterations",
  shouldFullyStop:
    "- should_fully_stop: set to true ONLY when the stop condition below is fully met and the entire loop should end. default to false",
} as const;

function buildOutputFields(
  stopWhen: string | undefined,
  commitMessage: CommitMessageConfig | undefined,
): string {
  // Prefix constants are pinned original wording. Append clarification only.
  // Prefer inclusive wording over concrete noun lists so valid future-use notes
  // are not accidentally excluded.
  // Keep guidance generic; coverage/test runs are examples, not the target case.
  // Goal: concise, accurate, complete `notes.md`.
  const outputFields = [
    ORIGINAL_OUTPUT_FIELD_PREFIXES.success,
    `${ORIGINAL_OUTPUT_FIELD_PREFIXES.summary}. primary notes headline; capture durable outcome or failure, not activity. may fully cover the iteration when no extra details are needed. no dummy placeholders, file/test names, or numeric recaps`,
    `${ORIGINAL_OUTPUT_FIELD_PREFIXES.keyChanges}. optional notes details: include only distinct durable outcomes not captured by summary; omit work mechanics unless future work depends on them. success=false -> []`,
    `${ORIGINAL_OUTPUT_FIELD_PREFIXES.keyLearnings}. future-use facts affecting later work; use [] when none changed. on failure, include reusable findings only. omit completed-work facts, obvious context, stale blockers, or loose TODOs`,
  ];

  for (const field of getCommitMessagePromptFields(commitMessage)) {
    const constraints = [
      field.allowed === undefined
        ? null
        : `allowed values: ${field.allowed.join(", ")}`,
      `default: ${JSON.stringify(field.default)}`,
    ].filter((value): value is string => value !== null);
    outputFields.push(
      `- ${field.name}: ${field.description}. ${constraints.join("; ")}`,
    );
  }

  if (stopWhen !== undefined) {
    // Preserve original stop-field semantics: false until fully met.
    outputFields.push(ORIGINAL_OUTPUT_FIELD_PREFIXES.shouldFullyStop);
  }

  return outputFields.join("\n");
}

// Keep `notes.md` quoted in output instructions.
// Do not drop the ultra-concise line; it anchors `notes.md` compression.
// Do not add exact word/item quotas here; enforce concision by semantics.
// Preserve enough context for future decisions; over-compressed ambiguous notes
// are worse than slightly longer accurate handoff memory.
function buildOutputInstructions(
  stopWhen: string | undefined,
  commitMessage: CommitMessageConfig | undefined,
): string {
  return `Work normally. Only final assistant message must be raw schema-matching JSON.
No prose wrapper or Markdown fence in final JSON.
No interim JSON required; accidental interim JSON/schema-shaped progress is not failure.
Non-final JSON may contain dummy/placeholders; avoid to save tokens.
Final JSON must not use dummy placeholder strings.
Do not claim schema/response-format/channel/tool blockers unless an actual failed tool call prevents completion.

Goal: concise yet accurate and complete \`notes.md\` handoff memory.
Final JSON feeds \`notes.md\` for future iterations, not changelog/report prose.
Write notes-ready values: decision-relevant context only.
Preserve accuracy and completeness; compress aggressively.
Ultra-concise mandatory. Fragments OK. No filler.
Present conclusions directly; no preamble, setup, or generic closers.
Preserve enough context for future decisions; use normal prose when compression would make meaning ambiguous.
Keep technical terms, code symbols, function/API names, and error strings exact.
Pattern: \`thing action -> reason/effect\`.
Prefer one clear fact per note; omit low-signal, obvious, or known information.
Omit validation results, file lists, numeric recaps, edit narration.
Omit rationale/history unless future work depends on it.

${buildOutputFields(stopWhen, commitMessage)}`;
}

function buildStopConditionSection(stopWhen: string | undefined): string {
  // Preserve original wording; agents handle this instruction better uncompressed.
  return stopWhen !== undefined
    ? `\n\n## Stop Condition\n\nThe user has configured a condition to end the loop: ${stopWhen}\nIf this condition is fully met after this iteration's work, set should_fully_stop=true in your output. Otherwise set it to false.`
    : "";
}

function buildOriginalIterationPrompt(
  params: IterationPromptParams,
  outputInstructions: string,
  stopConditionSection: string,
): string {
  // Original prompt: incremental-work bias. Output contract is shared.
  const notesInstruction = buildNotesInstruction(params);
  return `You are working autonomously towards an objective given below.
This is iteration ${params.n}. Each iteration aims to make an incremental step forward, not to complete the entire objective.

${notesInstruction}

## Instructions

1. Do NOT respond first. Do NOT write to or modify \`notes.md\` - it is maintained automatically by the gnhf orchestrator
2. Identify the next smallest logical unit of work that's individually verifiable and would make incremental progress towards the objective, and treat that as the scope of this iteration
3. If you attempted a solution and it didn't end up moving the needle on the objective, document learnings and record success=false, then conclude the iteration rather than continuously pivoting
4. If you made code changes, run build/tests/linters/formatters if available to validate your work. Do NOT make any git commits - that will be handled automatically by the gnhf orchestrator
5. If you started any long-running background processes (dev servers, browsers, watchers, Electron, etc.), stop them before finishing the iteration
6. Only submit the final JSON object after the result is final: your work is complete, validation is done, and you have stopped any background processes you started

## Output

${outputInstructions}${stopConditionSection}

## Objective

${params.prompt}`;
}

function buildRevisedIterationPrompt(
  params: IterationPromptParams,
  outputInstructions: string,
  stopConditionSection: string,
): string {
  // Revised prompt: bigger-work bias. Output contract stays identical to Original.
  // Keep notes handling plus instruction 1 and the final 4 instructions pinned
  // to Original. Only the middle scope-selection instructions should differ.
  const notesInstruction = buildNotesInstruction(params);
  return `You are working autonomously towards an objective given below.
This is iteration ${params.n}. Prefer one substantial, cohesive slice over local cleanup. Tiny correct edits are fallback only when the objective itself is narrow.

${notesInstruction}

## Instructions

1. Do NOT respond first. Do NOT write to or modify \`notes.md\` - it is maintained automatically by the gnhf orchestrator
2. After reviewing relevant notes, compare candidate scopes before editing. Pick the broadest cohesive objective slice you can finish and validate, across related affected areas sharing one reason to change and one validation boundary. Scope by objective boundary, not first location/symptom found. Objective scope overrides this default
3. Do not choose isolated cleanup, one-offs, or small local batches while broader same-objective work shares the same reason and validation boundary. Tiny is acceptable only when the objective or validation boundary is truly narrow
4. Existing unrelated validation blockers do not justify tiny scope. Use targeted validation; still complete the coherent slice you can validate
5. Before finishing, scan the chosen boundary once and fix missed same-cause gaps you can validate
6. Defer unrelated behavior, speculative work, and validation you cannot finish
7. If you attempted a solution and it didn't end up moving the needle on the objective, document learnings and record success=false, then conclude the iteration rather than continuously pivoting
8. If you made code changes, run build/tests/linters/formatters if available to validate your work. Do NOT make any git commits - that will be handled automatically by the gnhf orchestrator
9. If you started any long-running background processes (dev servers, browsers, watchers, Electron, etc.), stop them before finishing the iteration
10. Only submit the final JSON object after the result is final: your work is complete, validation is done, and you have stopped any background processes you started

## Output

${outputInstructions}${stopConditionSection}

## Objective

${params.prompt}`;
}

function buildNotesInstruction(params: IterationPromptParams): string {
  const notesPath = `.gnhf/runs/${params.runId}/notes.md`;
  const stats =
    params.notesMetadata === undefined
      ? ""
      : ` ${params.notesMetadata.lineCount} lines, ${params.notesMetadata.wordCount} words.`;

  return `Review \`${notesPath}\` first to understand previous iterations; start with recent entries, read deeper only when relevant.
\`notes.md\`:${stats} format: \`N:\` summary | \`+\` change | \`?\` learning`;
}
