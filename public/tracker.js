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

function isRunCardioSubtype(sub) {
  return sub === "treadmill" || sub === "outdoor";
}

function formatMinPerKm(minutes) {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "—";
  const whole = Math.floor(minutes);
  const sec = Math.min(59, Math.round((minutes - whole) * 60));
  return `${whole}:${String(sec).padStart(2, "0")}`;
}

/** From distance + time strings: avg speed (km/h) and pace (min/km as MM:SS). */
function computeRunMetrics(distStr, timeStr) {
  const km = hyroxParseDistanceKm(distStr);
  const sec = hyroxParseTimeToSeconds(timeStr);
  if (km <= 0.001 || sec <= 0) return { speed: "—", pace: "—" };
  const speed = km / (sec / 3600);
  const paceMin = sec / 60 / km;
  return {
    speed: `${Math.round(speed * 100) / 100}`,
    pace: formatMinPerKm(paceMin),
  };
}

function sessionPace500Display(distanceStr, timeStr) {
  const km = hyroxParseDistanceKm(distanceStr);
  const sec = hyroxParseTimeToSeconds(timeStr);
  const dm = km * 1000;
  if (dm <= 1 || sec <= 0) return "—";
  const min = ((sec / dm) * 500) / 60;
  return `${Math.round(min * 100) / 100}`;
}

function buildCardioFieldsHtml(isoStr, slotIndex, workout, subtype) {
  const dist = escapeAttr(workout.cardioDistance ?? "");
  const time = escapeAttr(workout.cardioTime ?? "");
  const base = `data-date="${isoStr}" data-slot="${slotIndex}"`;

  if (isRunCardioSubtype(subtype)) {
    const { speed, pace } = computeRunMetrics(workout.cardioDistance, workout.cardioTime);
    return `
        <div class="day-cardio-fields">
          <label class="field-label">
            <span class="field-label__text">Distance</span>
            <input type="text" class="day-cardio-field" ${base} data-field="distance" inputmode="decimal" autocomplete="off" placeholder="km (e.g. 5)" value="${dist}" />
          </label>
          <label class="field-label">
            <span class="field-label__text">Total time</span>
            <input type="text" class="day-cardio-field" ${base} data-field="time" inputmode="text" autocomplete="off" placeholder="e.g. 32:00 or 35 min" value="${time}" />
          </label>
          <div class="day-cardio-metrics" aria-live="polite">
            <div class="day-cardio-metric">
              <span class="field-label__text">Avg speed (km/h)</span>
              <span class="day-cardio-metric__val day-cardio-run-speed">${escapeAttr(speed)}</span>
            </div>
            <div class="day-cardio-metric">
              <span class="field-label__text">Avg pace (min/km)</span>
              <span class="day-cardio-metric__val day-cardio-run-pace">${escapeAttr(pace)}</span>
            </div>
          </div>
        </div>`;
  }

  if (subtype === "ski-erg") {
    const p500 = sessionPace500Display(workout.cardioDistance, workout.cardioTime);
    return `
        <div class="day-cardio-fields">
          <label class="field-label">
            <span class="field-label__text">Distance</span>
            <input type="text" class="day-cardio-field" ${base} data-field="distance" inputmode="text" autocomplete="off" placeholder="km" value="${dist}" />
          </label>
          <label class="field-label">
            <span class="field-label__text">Total time</span>
            <input type="text" class="day-cardio-field" ${base} data-field="time" inputmode="text" autocomplete="off" placeholder="e.g. 40:00" value="${time}" />
          </label>
          <div class="day-cardio-metrics" aria-live="polite">
            <div class="day-cardio-metric">
              <span class="field-label__text">Pace /500m (min)</span>
              <span class="day-cardio-metric__val day-cardio-pace500">${escapeAttr(p500)}</span>
            </div>
          </div>
        </div>`;
  }

  if (subtype === "rower") {
    const split = sessionPace500Display(workout.cardioDistance, workout.cardioTime);
    return `
        <div class="day-cardio-fields">
          <label class="field-label">
            <span class="field-label__text">Distance</span>
            <input type="text" class="day-cardio-field" ${base} data-field="distance" inputmode="text" autocomplete="off" placeholder="km" value="${dist}" />
          </label>
          <label class="field-label">
            <span class="field-label__text">Total time</span>
            <input type="text" class="day-cardio-field" ${base} data-field="time" inputmode="text" autocomplete="off" placeholder="e.g. 30:00" value="${time}" />
          </label>
          <div class="day-cardio-metrics" aria-live="polite">
            <div class="day-cardio-metric">
              <span class="field-label__text">Avg split /500m (min)</span>
              <span class="day-cardio-metric__val day-cardio-pace500">${escapeAttr(split)}</span>
            </div>
          </div>
        </div>`;
  }

  return "";
}

function buildWorkoutSlot(isoStr, slotIndex, workout, isOptional) {
  const type = workout.workoutType || "";
  const done = Boolean(workout.workoutDone);
  const cardioSubtype = workout.cardioSubtype || "";
  const showCardioRow = type === "cardio";
  const showCardioDetail = showCardioRow && cardioSubtype !== "";

  const opts = WORKOUT_OPTIONS.map((o) => {
    const sel = o.value === type ? " selected" : "";
    return `<option value="${o.value}"${sel}>${o.label}</option>`;
  }).join("");

  const subOpts = CARDIO_SUB_OPTIONS.map((o) => {
    const sel = o.value === cardioSubtype ? " selected" : "";
    return `<option value="${o.value}"${sel}>${o.label}</option>`;
  }).join("");

  const wdId = `wd-${isoStr}-${slotIndex}`;
  const slotTitle = isOptional ? "Second workout (optional)" : "Workout";
  const cardioRowClass = showCardioRow ? "day-card__cardio" : "day-card__cardio hidden";
  const cardioDetailClass = showCardioDetail ? "day-card__cardio-detail" : "day-card__cardio-detail hidden";
  const detailHtml = showCardioDetail ? buildCardioFieldsHtml(isoStr, slotIndex, workout, cardioSubtype) : "";

  return `
    <div class="day-card__workout-slot" data-workout-slot="${slotIndex}">
      <p class="day-card__slot-title">${slotTitle}</p>
      <div class="day-card__workout">
        <select class="day-type" data-date="${isoStr}" data-slot="${slotIndex}" aria-label="${slotTitle} for ${shortDayLabel(isoStr)}">${opts}</select>
        <label class="check-line check-line--inline" for="${wdId}">
          <input type="checkbox" id="${wdId}" class="day-done" data-date="${isoStr}" data-slot="${slotIndex}"${done ? " checked" : ""} />
          <span>Done</span>
        </label>
      </div>
      <div class="${cardioRowClass}">
        <label class="cardio-sub-label" for="cardio-sub-${isoStr}-${slotIndex}">Cardio type</label>
        <select class="day-cardio-sub" id="cardio-sub-${isoStr}-${slotIndex}" data-date="${isoStr}" data-slot="${slotIndex}" aria-label="Cardio type (${slotTitle}) for ${shortDayLabel(isoStr)}">${subOpts}</select>
      </div>
      <div class="${cardioDetailClass}" data-cardio-detail="${isoStr}-${slotIndex}">
        ${detailHtml}
      </div>
    </div>`;
}

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

function getWorkoutsArray(day) {
  if (day.workouts && Array.isArray(day.workouts) && day.workouts.length >= 1) {
    const a = normalizeWorkoutSlot(day.workouts[0]);
    const b =
      day.workouts.length >= 2 ? normalizeWorkoutSlot(day.workouts[1]) : defaultWorkoutSlot();
    return [a, b];
  }
  const w0 = normalizeWorkoutSlot({
    workoutType: day.workoutType,
    workoutDone: day.workoutDone,
    cardioSubtype: day.cardioSubtype,
    cardioDistance: day.cardioDistance,
    cardioTime: day.cardioTime,
    cardioPace: day.cardioPace,
  });
  return [w0, defaultWorkoutSlot()];
}

function buildDayCard(isoStr, day) {
  const rings = day.rings || [false, false, false];
  const workouts = getWorkoutsArray(day);

  const ringHtml = RING_LABELS.map((label, i) => {
    const id = `ring-${isoStr}-${i}`;
    const checked = rings[i] ? " checked" : "";
    return `<label class="check-line" for="${id}">
      <input type="checkbox" id="${id}" class="day-ring" data-date="${isoStr}" data-ring="${i}"${checked} />
      <span>${label}</span>
    </label>`;
  }).join("");

  const slotsHtml = [
    buildWorkoutSlot(isoStr, 0, workouts[0], false),
    buildWorkoutSlot(isoStr, 1, workouts[1], true),
  ].join("");

  return `
    <article class="day-card" data-date="${isoStr}">
      <header class="day-card__head">${shortDayLabel(isoStr)}</header>
      <div class="day-card__rings">${ringHtml}</div>
      ${slotsHtml}
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
  const day = normalizeDayFromStorage(rec.days[isoStr] || defaultDay());
  if (!day.rings) day.rings = [false, false, false];
  day.rings[idx] = t.checked;
  rec.days[isoStr] = day;
  await putWeek(rec);
  weekCache = rec;
  renderProgressBars(weekCompletionCount(rec));
  await refreshCampaignBar();
}

function clearCardioExtras(slot) {
  slot.cardioSubtype = "";
  slot.cardioDistance = "";
  slot.cardioTime = "";
  slot.cardioPace = "";
}

function parseSlotIndex(t) {
  const s = t.getAttribute("data-slot");
  if (s === "0" || s === "1") return Number.parseInt(s, 10);
  return 0;
}

async function onTypeChange(e) {
  const t = e.target;
  if (!t.classList.contains("day-type")) return;
  const isoStr = t.getAttribute("data-date");
  const slotIdx = parseSlotIndex(t);
  const rec = await getWeekOrDefault(displayedWeekMonday());
  const day = normalizeDayFromStorage(rec.days[isoStr] || defaultDay());
  if (!day.workouts) day.workouts = [defaultWorkoutSlot(), defaultWorkoutSlot()];
  day.workouts[slotIdx] = day.workouts[slotIdx] || defaultWorkoutSlot();
  day.workouts[slotIdx].workoutType = t.value;
  if (!t.value) day.workouts[slotIdx].workoutDone = false;
  if (t.value !== "cardio") clearCardioExtras(day.workouts[slotIdx]);
  rec.days[isoStr] = day;
  await putWeek(rec);
  weekCache = rec;
  await renderWeek();
}

async function onCardioSubChange(e) {
  const t = e.target;
  if (!t.classList.contains("day-cardio-sub")) return;
  const isoStr = t.getAttribute("data-date");
  const slotIdx = parseSlotIndex(t);
  const rec = await getWeekOrDefault(displayedWeekMonday());
  const day = normalizeDayFromStorage(rec.days[isoStr] || defaultDay());
  if (!day.workouts) day.workouts = [defaultWorkoutSlot(), defaultWorkoutSlot()];
  day.workouts[slotIdx] = day.workouts[slotIdx] || defaultWorkoutSlot();
  day.workouts[slotIdx].cardioSubtype = t.value;
  if (!t.value) clearCardioExtras(day.workouts[slotIdx]);
  else {
    day.workouts[slotIdx].cardioDistance = day.workouts[slotIdx].cardioDistance || "";
    day.workouts[slotIdx].cardioTime = day.workouts[slotIdx].cardioTime || "";
  }
  rec.days[isoStr] = day;
  await putWeek(rec);
  weekCache = rec;
  await renderWeek();
}

function refreshCardioMetricsInCard(root, isoStr, slotIdx) {
  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(isoStr) : isoStr.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const card = root.querySelector(`article.day-card[data-date="${esc}"]`);
  if (!card) return;
  const slot = card.querySelector(`.day-card__workout-slot[data-workout-slot="${slotIdx}"]`);
  if (!slot) return;
  const distIn = slot.querySelector('.day-cardio-field[data-field="distance"]');
  const timeIn = slot.querySelector('.day-cardio-field[data-field="time"]');
  if (!distIn || !timeIn) return;
  const subEl = slot.querySelector(".day-cardio-sub");
  const subtype = subEl ? subEl.value : "";
  const dVal = distIn.value;
  const tVal = timeIn.value;
  const speedEl = slot.querySelector(".day-cardio-run-speed");
  const paceEl = slot.querySelector(".day-cardio-run-pace");
  const p500El = slot.querySelector(".day-cardio-pace500");

  if (isRunCardioSubtype(subtype)) {
    const { speed, pace } = computeRunMetrics(dVal, tVal);
    if (speedEl) speedEl.textContent = speed;
    if (paceEl) paceEl.textContent = pace;
  } else if (subtype === "ski-erg" || subtype === "rower") {
    const p = sessionPace500Display(dVal, tVal);
    if (p500El) p500El.textContent = p;
  }
}

async function onCardioFieldInput(e) {
  const t = e.target;
  if (!t.classList.contains("day-cardio-field")) return;
  const isoStr = t.getAttribute("data-date");
  const slotIdx = parseSlotIndex(t);
  const field = t.getAttribute("data-field");
  const rec = await getWeekOrDefault(displayedWeekMonday());
  const day = normalizeDayFromStorage(rec.days[isoStr] || defaultDay());
  if (!day.workouts) day.workouts = [defaultWorkoutSlot(), defaultWorkoutSlot()];
  day.workouts[slotIdx] = day.workouts[slotIdx] || defaultWorkoutSlot();
  if (field === "distance") day.workouts[slotIdx].cardioDistance = t.value;
  else if (field === "time") day.workouts[slotIdx].cardioTime = t.value;
  rec.days[isoStr] = day;
  await putWeek(rec);
  weekCache = rec;
  const root = document.getElementById("week-tracker");
  if (root) refreshCardioMetricsInCard(root, isoStr, slotIdx);
}

async function onDoneChange(e) {
  const t = e.target;
  if (!t.classList.contains("day-done")) return;
  const isoStr = t.getAttribute("data-date");
  const slotIdx = parseSlotIndex(t);
  const rec = await getWeekOrDefault(displayedWeekMonday());
  const day = normalizeDayFromStorage(rec.days[isoStr] || defaultDay());
  if (!day.workouts) day.workouts = [defaultWorkoutSlot(), defaultWorkoutSlot()];
  day.workouts[slotIdx] = day.workouts[slotIdx] || defaultWorkoutSlot();
  day.workouts[slotIdx].workoutDone = t.checked;
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
  window.addEventListener("hyrox-synced", () => {
    renderWeek().catch((err) => console.error("[Hyrox] renderWeek", err));
  });
  window.addEventListener("hyrox-auth-changed", () => {
    renderWeek().catch((err) => console.error("[Hyrox] renderWeek", err));
  });
});
