# Repository working rules

## Problem-solving principles

Apply these questions before implementation or bug fixes; keep the review brief for simple tasks.

- First principles: What outcome is actually required, and which constraints are verified facts rather than assumptions inherited from the current implementation?
- Independent judgment: Treat the user's diagnoses and proposed solutions as hypotheses to evaluate, not facts to agree with. Judge them from first principles and available evidence, regardless of confidence or repetition. When evidence points elsewhere, explain the disagreement plainly and recommend a better-supported approach. State uncertainty and revise conclusions when new evidence warrants it. Respect the user's explicit goals, constraints, and final decisions; do not confuse independent judgment with overriding them.
- The best part is no part: Before adding state, branches, dependencies, or abstractions, can the problem be solved by removing an element or consolidating responsibility?
- Ownership: Who should own each state and behavior? For gestures, events, asynchronous work, and synchronization, check for competing owners and control flows.
- Root cause: What mechanism explains the observed behavior? Separate observations from hypotheses, and verify that the fix addresses the cause.
- If an approach repeatedly fails, revisit the problem definition, assumptions, and ownership boundaries before adding more patches.

Judge simplicity by the number of independent concepts, states, responsibilities, and interactions, not just line count. Keep changes within the requested scope; these principles do not justify unrelated redesigns.

## Existing decisions and design

- Before changing an area covered by `docs/decisions/`, read the relevant decision record.
- When code changes a recorded decision, update the code and that decision record together.

- Before changing Breeze UI or public brand surfaces, read `DESIGN.md`. Preserve the approved lookup and shared dock, and verify changed surfaces in light/dark at phone, tablet, desktop and short viewport sizes.
