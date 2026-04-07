# Hyrox Training & Countdown

## Purpose

Build an application that **counts down to your next Hyrox event** and helps you **track training progress and race readiness** in one place. The goal is clarity: know how much time remains, whether your plan is on track, and how prepared you feel for race day.

## What Hyrox Is (context)

Hyrox is a standardized indoor fitness race: running segments combined with functional workout stations (sleds, burpees, rowing, etc.). Training and readiness are measured across conditioning, strength, and station-specific work—not just a single metric.

## Project goals

1. **Countdown** — Show time until the user’s target Hyrox date (and optionally event name/location).
2. **Training tracking** — Log sessions, key metrics, and milestones aligned to Hyrox prep (e.g., weekly volume, station focus, test results).
3. **Readiness** — Surface a structured view of “how ready am I?” using goals, recent consistency, and optional self-assessment or benchmark data.

## Scope (initial)

- In scope: configurable race date, persistent storage of training data, dashboards or summaries for progress and readiness, clear UX for daily use.
- Out of scope (unless requirements change): social feeds, coaching marketplace, official Hyrox branding without permission, medical advice.

## Technical direction (to be decided)

Stack, platform (web / desktop / mobile), and hosting are **not fixed** in this document. The requirements and rules files constrain how the project should evolve once implementation begins.

## Related documents

- `requirements.md` — Features, constraints, and acceptance-oriented detail.
- `rules.md` — Conventions, quality bar, and collaboration rules for this repo.

## Success criteria

- You can set or update your Hyrox date and always see an accurate countdown.
- You can record training in a way that fits your actual routine, not a generic workout app.
- You can answer “am I on track?” with evidence from the app, not only gut feel.
