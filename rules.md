# Project rules — Hyrox Training & Countdown

These rules apply to all implementation work in this repository. They complement `requirements.md` and `project.md`.

## 1. Scope and changes

- Implement features **traceable to requirements** (use requirement IDs in PRs/commits when practical).
- Do not add unrelated features, dependencies, or refactors “while you’re in there.”
- Prefer **small, reviewable changes** over large mixed diffs.

## 2. Data and privacy

- Treat training and readiness data as **sensitive**: minimize logging of personal content in analytics or crash reports.
- Avoid sending health or training data to third parties without an explicit requirement and user consent.
- If persistence format changes, provide **migration** or export path when feasible.

## 3. Code quality

- Match **existing project style** (formatting, naming, file layout) when present.
- **No silent failures**: errors should surface in development; user-facing errors should be understandable.
- Keep **business logic** testable (separate pure logic from UI where reasonable).

## 4. Hyrox domain

- Copy and UX should use **accurate, non-misleading** language about Hyrox (a standardized race format; not affiliated unless officially integrated).
- Training concepts should reflect **running + stations**, not only generic bodybuilding metrics, unless the user explicitly logs them as supplementary.

## 5. AI and collaboration (Cursor / assistants)

- Follow **user instructions** and these documents; do not override stated requirements without calling out the conflict.
- Prefer **editing existing code** over duplicating similar modules.
- Do not add documentation files the user did not request, except updates to `project.md`, `requirements.md`, or `rules.md` when the user asks for project documentation changes.

## 6. Definition of done (implementation)

- Feature works on the **chosen target platform** for this repo.
- Meets the **Must** items in `requirements.md` for that feature slice.
- No new linter errors in touched files; tests run if the project has a test command.
