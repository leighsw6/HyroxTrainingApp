# Requirements — Hyrox Training & Countdown

## 1. Product overview

The application supports **one primary user** (expandable later) who is preparing for a Hyrox event. It must provide a **countdown to race day** and **training plus readiness tracking** that respects Hyrox-specific prep (running + stations, not arbitrary gym metrics only).

## 2. Functional requirements

### 2.1 Race & countdown

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | User can set a **target Hyrox date** (date-only or datetime in local timezone). | Must |
| R2 | Home or primary screen shows a **clear countdown** (days; optionally hours/minutes if same-day precision is needed). | Must |
| R3 | User can set optional **event metadata**: name, city, or notes. | Should |
| R4 | Countdown updates automatically when the date changes (e.g., after midnight local time). | Must |
| R5 | If no date is set, the app explains what to do next (empty state). | Should |

### 2.2 Training progress

| ID | Requirement | Priority |
|----|-------------|----------|
| T1 | User can **log training sessions** with at least: date, duration or session type, and free-text or structured notes. | Must |
| T2 | User can tag or categorize work relevant to Hyrox: e.g. **run**, **station skill**, **mixed**, **recovery**. | Should |
| T3 | User can see a **history list** and **simple aggregates** (e.g., sessions per week, streak or consistency). | Must |
| T4 | User can edit or delete logged sessions (with confirmation for delete). | Should |
| T5 | Data persists across app restarts and updates. | Must |

### 2.3 Readiness

| ID | Requirement | Priority |
|----|-------------|----------|
| Y1 | User can record **readiness signals**: e.g. subjective 1–10, fatigue, or short checklist (configurable later). | Should |
| Y2 | App shows a **readiness summary** alongside training (e.g. last 7/14 days) so “feel” is not disconnected from volume. | Should |
| Y3 | Optional: **benchmark fields** (e.g. 5k time, station test results) stored with dates for trend visibility. | Could |

### 2.4 Settings & data

| ID | Requirement | Priority |
|----|-------------|----------|
| S1 | User can change timezone or relies on **system local time** consistently for dates. | Must |
| S2 | Export or backup of data (e.g. JSON/CSV) is desirable before v1.0 lock-in. | Could |
| S3 | No account required for MVP unless cloud sync is a chosen architecture. | Should (MVP) |

## 3. Non-functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N1 | **Privacy**: Training and readiness data stay on-device or in user-controlled storage unless explicitly designed otherwise. | Must |
| N2 | **Performance**: Primary screens load quickly on target devices; no blocking UI on save. | Must |
| N3 | **Reliability**: No silent data loss on crash; validate inputs. | Must |
| N4 | **Accessibility**: Reasonable contrast, labels for interactive elements, keyboard/focus where applicable. | Should |

## 4. Out of scope (v1)

- Nutrition planning, meal tracking, or medical diagnosis.
- Integration with Hyrox official APIs unless available and licensed.
- Multi-user coaching workflows.

## 5. Acceptance themes (how we know it’s “done” for v1)

- Countdown is correct for the user’s locale and stored race date.
- Sessions can be added and reviewed over multiple weeks.
- At least one readiness or summary view connects training volume to “how ready you feel” or benchmarks.

## 6. Open decisions

Record these in `project.md` or ADRs when resolved:

- Platform: web, mobile native, or desktop.
- Local-only vs synced storage.
- Exact taxonomy for session types and readiness fields.
