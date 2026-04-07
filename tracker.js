const RING_LABELS = [
  "10,000 steps",
  "60 min exercise",
  "3,500 kJ active energy",
];

const WORKOUT_OPTIONS = [
  { value: "", label: "Workout type…" },
  { value: "ceremony", label: "Les Mills Ceremony" },
  { value: "weight", label: "Weight training" },
  { value: "cardio", label: "Cardio training" },
  { value: "hyrox_style", label: "Hyrox-style workout" },
  { value: "hyrox_sim", label: "Hyrox Simulation" },
];

const CARDIO_SUB_OPTIONS = [
  { value: "", label: "Cardio type…" },
  { value: "treadmill", label: "Treadmill" },
  { value: "outdoor", label: "Outdoor run" },
  { value: "ski-erg", label: "Ski-erg" },
  { value: "rower", label: "Rower" },
];

const LS_TRACK_START = "hyrox_tracking_start_week";

/** Race day (local calendar): Fri 3 Jul 2026 — week bounds use browser local timezone. */
const RACE_DAY = new Date(2026, 6, 3, 12, 0, 0);

/** 21 rings + 1 ceremony + 4 weight + 2 cardio + 1 hyrox-style + 1 hyrox sim */
const WEEK_TOTAL = 30;

let viewOffset = 0;
let weekCache = null;

function ensureTrackingStartWeek() {
  const cur = isoDate(mondayOfLocalWeek(new Date()));
  let start = localStorage.getItem(LS_TRACK_START);
  if (!start) {
    start = cur;
    localStorage.setItem(LS_TRACK_START, start);
  }
  return start;
}

function raceWeekMondayIso() {
  return isoDate(mondayOfLocalWeek(RACE_DAY));
}

function displayedWeekMonday() {
  const base = mondayOfLocalWeek(new Date());
  base.setDate(base.getDate() + viewOffset * 7);
  return isoDate(base);
}

function shortDayLabel(isoStr) {
  const d = parseIsoLocal(isoStr);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function updateWeekNavButtons() {
  const prev = document.getElementById("week-prev");
  const next = document.getElementById("week-next");
  const raceMon = raceWeekMondayIso();
  const disp = displayedWeekMonday();
  const start = ensureTrackingStartWeek();
  if (prev) prev.disabled = disp <= start;
  if (next) {
    const nextMon = parseIsoLocal(disp);
    nextMon.setDate(nextMon.getDate() + 7);
    next.disabled = isoDate(nextMon) > raceMon;
  }
}

async function loadDisplayedWeek() {
  const wk = displayedWeekMonday();
  weekCache = await getWeekOrDefault(wk);
  return weekCache;
}

function pct(n, d) {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

async function computeCampaign() {
  const start = ensureTrackingStartWeek();
  const end = raceWeekMondayIso();
  const keys = weekKeysBetweenInclusive(start, end);
  const scheduled = keys.length * WEEK_TOTAL;
  const nowMon = isoDate(mondayOfLocalWeek(new Date()));
  let completed = 0;
  for (const wk of keys) {
    if (wk > nowMon) break;
    const rec = await getWeek(wk);
    if (!rec) continue;
    completed += weekCompletionCount(rec);
  }
  return { scheduled, completed, weeks: keys.length };
}

function renderProgressBars(weeklyNum) {
  const wEl = document.getElementById("progress-weekly");
  const cEl = document.getElementById("progress-campaign");
  const wPct = pct(weeklyNum, WEEK_TOTAL);
  if (wEl) {
    wEl.style.setProperty("--p", `${wPct}%`);
    wEl.setAttribute("aria-valuenow", String(Math.round(wPct)));
    const t = document.getElementById("progress-weekly-text");
    if (t) t.textContent = `${wPct}% · this week (${weeklyNum}/${WEEK_TOTAL})`;
  }
}

async function refreshCampaignBar() {
  const { scheduled, completed } = await computeCampaign();
  const cEl = document.getElementById("progress-campaign");
  const cp = pct(completed, scheduled);
  if (cEl) {
    cEl.style.setProperty("--p", `${cp}%`);
    cEl.setAttribute("aria-valuenow", String(Math.round(cp)));
    const t = document.getElementById("progress-campaign-text");
    if (t) t.textContent = `${cp}% · to Hyrox (${completed}/${scheduled} tasks)`;
  }
}

function buildDayCard(isoStr, day) {
  const rings = day.rings || [false, false, false];
  const type = day.workoutType || "";
  const done = Boolean(day.workoutDone);
  const cardioSubtype = day.cardioSubtype || "";
  const dist = escapeAttr(day.cardioDistance ?? "");
  const time = escapeAttr(day.cardioTime ?? "");
  const pace = escapeAttr(day.cardioPace ?? "");
  const showCardioRow = type === "cardio";
  const showCardioDetail = showCardioRow && cardioSubtype !== "";

  const ringHtml = RING_LABELS.map((label, i) => {
    const id = `ring-${isoStr}-${i}`;
    const checked = rings[i] ? " checked" : "";
    return `<label class="check-line" for="${id}">
      <input type="checkbox" id="${id}" class="day-ring" data-date="${isoStr}" data-ring="${i}"${checked} />
      <span>${label}</span>
    </label>`;
  }).join("");

  const opts = WORKOUT_OPTIONS.map((o) => {
    const sel = o.value === type ? " selected" : "";
    return `<option value="${o.value}"${sel}>${o.label}</option>`;
  }).join("");

  const subOpts = CARDIO_SUB_OPTIONS.map((o) => {
    const sel = o.value === cardioSubtype ? " selected" : "";
    return `<option value="${o.value}"${sel}>${o.label}</option>`;
  }).join("");

  const wdId = `wd-${isoStr}`;
  const cardioRowClass = showCardioRow ? "day-card__cardio" : "day-card__cardio hidden";
  const cardioDetailClass = showCardioDetail ? "day-card__cardio-detail" : "day-card__cardio-detail hidden";

  return `
    <article class="day-card" data-date="${isoStr}">
      <header class="day-card__head">${shortDayLabel(isoStr)}</header>
      <div class="day-card__rings">${ringHtml}</div>
      <div class="day-card__workout">
        <select class="day-type" data-date="${isoStr}" aria-label="Workout type for ${shortDayLabel(isoStr)}">${opts}</select>
        <label class="check-line check-line--inline" for="${wdId}">
          <input type="checkbox" id="${wdId}" class="day-done" data-date="${isoStr}"${done ? " checked" : ""} />
          <span>Done</span>
        </label>
      </div>
      <div class="${cardioRowClass}">
        <label class="cardio-sub-label" for="cardio-sub-${isoStr}">Cardio type</label>
        <select class="day-cardio-sub" id="cardio-sub-${isoStr}" data-date="${isoStr}" aria-label="Cardio type for ${shortDayLabel(isoStr)}">${subOpts}</select>
      </div>
      <div class="${cardioDetailClass}">
        <div class="day-cardio-fields">
          <label class="field-label">
            <span class="field-label__text">Distance</span>
            <input type="text" class="day-cardio-field" data-date="${isoStr}" data-field="distance" inputmode="text" autocomplete="off" placeholder="e.g. 5 km" value="${dist}" />
          </label>
          <label class="field-label">
            <span class="field-label__text">Time</span>
            <input type="text" class="day-cardio-field" data-date="${isoStr}" data-field="time" inputmode="text" autocomplete="off" placeholder="e.g. 32:00" value="${time}" />
          </label>
          <label class="field-label">
            <span class="field-label__text">Speed / pace</span>
            <input type="text" class="day-cardio-field" data-date="${isoStr}" data-field="pace" inputmode="text" autocomplete="off" placeholder="e.g. 4:30 /km" value="${pace}" />
          </label>
        </div>
      </div>
    </article>`;
}

async function renderWeek() {
  const root = document.getElementById("week-tracker");
  if (!root) return;

  try {
    await loadDisplayedWeek();
  } catch (e) {
    console.error("[Hyrox] Could not load week data; showing blank week.", e);
    window.hyroxIdbReadFailed = true;
    const wk = displayedWeekMonday();
    const days = {};
    for (const k of iterWeekDayKeys(wk)) {
      days[k] = defaultDay();
    }
    weekCache = { weekKey: wk, days };
  }
  const wk = weekCache.weekKey;
  const dayKeys = iterWeekDayKeys(wk);
  const inner = dayKeys
    .map((isoStr) => {
      const day = weekCache.days[isoStr] || defaultDay();
      return buildDayCard(isoStr, day);
    })
    .join("");

  root.innerHTML = inner;

  const label = document.getElementById("week-range-label");
  if (label) {
    const a = shortDayLabel(dayKeys[0]);
    const b = shortDayLabel(dayKeys[6]);
    label.textContent = `${a} — ${b}`;
  }

  const weeklyNum = weekCompletionCount(weekCache);
  renderProgressBars(weeklyNum);
  await refreshCampaignBar();
  updateWeekNavButtons();

  const storageWarn = document.getElementById("storage-warning");
  if (storageWarn) {
    storageWarn.classList.toggle("hidden", !window.hyroxIdbReadFailed);
  }
}

async function onRingChange(e) {
  const t = e.target;
  if (!t.classList.contains("day-ring")) return;
  const isoStr = t.getAttribute("data-date");
  const idx = Number.parseInt(t.getAttribute("data-ring"), 10);
  const rec = await getWeekOrDefault(displayedWeekMonday());
  const day = rec.days[isoStr] || defaultDay();
  if (!day.rings) day.rings = [false, false, false];
  day.rings[idx] = t.checked;
  rec.days[isoStr] = day;
  await putWeek(rec);
  weekCache = rec;
  renderProgressBars(weekCompletionCount(rec));
  await refreshCampaignBar();
}

function clearCardioExtras(day) {
  day.cardioSubtype = "";
  day.cardioDistance = "";
  day.cardioTime = "";
  day.cardioPace = "";
}

async function onTypeChange(e) {
  const t = e.target;
  if (!t.classList.contains("day-type")) return;
  const isoStr = t.getAttribute("data-date");
  const rec = await getWeekOrDefault(displayedWeekMonday());
  const day = rec.days[isoStr] || defaultDay();
  day.workoutType = t.value;
  if (!t.value) day.workoutDone = false;
  if (t.value !== "cardio") clearCardioExtras(day);
  rec.days[isoStr] = day;
  await putWeek(rec);
  weekCache = rec;
  await renderWeek();
}

async function onCardioSubChange(e) {
  const t = e.target;
  if (!t.classList.contains("day-cardio-sub")) return;
  const isoStr = t.getAttribute("data-date");
  const rec = await getWeekOrDefault(displayedWeekMonday());
  const day = rec.days[isoStr] || defaultDay();
  day.cardioSubtype = t.value;
  if (!t.value) {
    day.cardioDistance = "";
    day.cardioTime = "";
    day.cardioPace = "";
  }
  rec.days[isoStr] = day;
  await putWeek(rec);
  weekCache = rec;
  await renderWeek();
}

async function onCardioFieldInput(e) {
  const t = e.target;
  if (!t.classList.contains("day-cardio-field")) return;
  const isoStr = t.getAttribute("data-date");
  const field = t.getAttribute("data-field");
  const rec = await getWeekOrDefault(displayedWeekMonday());
  const day = rec.days[isoStr] || defaultDay();
  if (field === "distance") day.cardioDistance = t.value;
  else if (field === "time") day.cardioTime = t.value;
  else if (field === "pace") day.cardioPace = t.value;
  rec.days[isoStr] = day;
  await putWeek(rec);
  weekCache = rec;
}

async function onDoneChange(e) {
  const t = e.target;
  if (!t.classList.contains("day-done")) return;
  const isoStr = t.getAttribute("data-date");
  const rec = await getWeekOrDefault(displayedWeekMonday());
  const day = rec.days[isoStr] || defaultDay();
  day.workoutDone = t.checked;
  rec.days[isoStr] = day;
  await putWeek(rec);
  weekCache = rec;
  renderProgressBars(weekCompletionCount(rec));
  await refreshCampaignBar();
}

function bindWeekRoot() {
  const root = document.getElementById("week-tracker");
  if (!root) return;
  root.addEventListener("change", (e) => {
    if (e.target.classList.contains("day-ring")) onRingChange(e);
    else if (e.target.classList.contains("day-type")) onTypeChange(e);
    else if (e.target.classList.contains("day-done")) onDoneChange(e);
    else if (e.target.classList.contains("day-cardio-sub")) onCardioSubChange(e);
  });
  root.addEventListener("input", (e) => {
    if (e.target.classList.contains("day-cardio-field")) onCardioFieldInput(e);
  });
}

function bindNav() {
  document.getElementById("week-prev")?.addEventListener("click", () => {
    viewOffset--;
    renderWeek().catch((err) => console.error("[Hyrox] renderWeek", err));
  });
  document.getElementById("week-next")?.addEventListener("click", () => {
    viewOffset++;
    renderWeek().catch((err) => console.error("[Hyrox] renderWeek", err));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  window.hyroxIdbReadFailed = false;
  ensureTrackingStartWeek();
  bindWeekRoot();
  bindNav();
  renderWeek().catch((err) => console.error("[Hyrox] renderWeek", err));
  window.addEventListener("hyrox-imported", () => {
    renderWeek().catch((err) => console.error("[Hyrox] renderWeek", err));
  });
});
