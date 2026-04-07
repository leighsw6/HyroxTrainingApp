/**
 * Timeline modal + weekly cardio charts. Uses globals from db.js & tracker.js.
 * Event time matches app.js TARGET.
 */
const HYROX_EVENT = new Date("2026-07-03T07:00:00+10:00");

let chartDistance = null;
let chartTime = null;
let timelineOpen = false;

/** Matches tracker.js cardio subtype values. */
const CARDIO_SUBTYPES = [
  { value: "treadmill", label: "Treadmill" },
  { value: "outdoor", label: "Outdoor run" },
  { value: "ski-erg", label: "Ski-erg" },
  { value: "rower", label: "Rower" },
];

let cachedCardioBySubtype = null;

/** Weekly rollups per cardio subtype (distance/time from log; derived fields when possible). */
function emptyWeeklyRow(wk) {
  return {
    weekKey: wk,
    distanceKm: 0,
    timeMin: 0,
    paceMinPerKm: null,
    avgSpeedKmh: null,
    pace500Min: null,
  };
}

function parseDistanceKm(s) {
  if (s == null || !String(s).trim()) return 0;
  const str = String(s).replace(/,/g, ".");
  const m = str.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  let v = parseFloat(m[1]);
  if (/mi(le)?s?\b/i.test(str)) v *= 1.60934;
  return v;
}

/** Single number = minutes; "MM:SS" or "H:MM:SS" with colons. */
function parseTimeToSeconds(s) {
  if (s == null || !String(s).trim()) return 0;
  const str = String(s).trim().replace(/,/g, ".");
  if (!str.includes(":")) {
    const n = parseFloat(str);
    return Number.isNaN(n) ? 0 : n * 60;
  }
  const parts = str.split(":").map((p) => parseFloat(p));
  if (parts.some((x) => Number.isNaN(x))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function shortWeekLabel(isoStr) {
  const d = parseIsoLocal(isoStr);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function weekRangeLabel(weekKey) {
  const keys = iterWeekDayKeys(weekKey);
  return `${shortWeekLabel(keys[0])} — ${shortWeekLabel(keys[6])}`;
}

function chartWeekLabel(weekKey) {
  const d = parseIsoLocal(weekKey);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isoToday() {
  return isoDate(new Date());
}

function firstSubtypeWithData(bySubtype) {
  for (const st of CARDIO_SUBTYPES) {
    const s = bySubtype[st.value];
    if (
      s.some(
        (row) =>
          row.distanceKm > 0 ||
          row.timeMin > 0 ||
          (row.paceMinPerKm != null && row.paceMinPerKm > 0) ||
          (row.avgSpeedKmh != null && row.avgSpeedKmh > 0) ||
          (row.pace500Min != null && row.pace500Min > 0)
      )
    ) {
      return st.value;
    }
  }
  return CARDIO_SUBTYPES[0].value;
}

/**
 * Per calendar week, per cardio subtype: summed distance/time from completed
 * cardio rows where cardioSubtype matches.
 */
async function aggregateCardioBySubtypeAndWeek() {
  const start = ensureTrackingStartWeek();
  const end = raceWeekMondayIso();
  const weekKeys = weekKeysBetweenInclusive(start, end);
  const bySubtype = {};
  for (const st of CARDIO_SUBTYPES) {
    bySubtype[st.value] = weekKeys.map((wk) => emptyWeeklyRow(wk));
  }
  for (let i = 0; i < weekKeys.length; i++) {
    const wk = weekKeys[i];
    const rec = await getWeek(wk);
    /** @type {Record<string, { distanceKm: number, timeSec: number }>} */
    const perSub = {};
    for (const d of iterWeekDayKeys(wk)) {
      const day = rec?.days?.[d];
      if (!day || day.workoutType !== "cardio" || !day.workoutDone || !day.cardioSubtype) {
        continue;
      }
      const sub = day.cardioSubtype;
      if (!bySubtype[sub]) continue;
      if (!perSub[sub]) perSub[sub] = { distanceKm: 0, timeSec: 0 };
      perSub[sub].distanceKm += parseDistanceKm(day.cardioDistance);
      perSub[sub].timeSec += parseTimeToSeconds(day.cardioTime);
    }
    for (const st of CARDIO_SUBTYPES) {
      const p = perSub[st.value];
      const row = bySubtype[st.value][i];
      if (p) {
        row.distanceKm = p.distanceKm;
        row.timeMin = p.timeSec / 60;
        row.paceMinPerKm =
          p.distanceKm > 0.01 && p.timeSec > 0 ? p.timeSec / 60 / p.distanceKm : null;
        row.avgSpeedKmh =
          p.distanceKm > 0.01 && p.timeSec > 0 ? p.distanceKm / (p.timeSec / 3600) : null;
        const dm = p.distanceKm * 1000;
        row.pace500Min =
          dm > 1 && p.timeSec > 0 ? ((p.timeSec / dm) * 500) / 60 : null;
      }
    }
  }
  return bySubtype;
}

function destroyCharts() {
  [chartDistance, chartTime].forEach((c) => {
    if (c) {
      c.destroy();
    }
  });
  chartDistance = chartTime = null;
}

function chartDefaults() {
  const tick = "#8b93a7";
  const grid = "rgba(255,255,255,0.06)";
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        ticks: { color: tick, maxRotation: 45, minRotation: 0 },
        grid: { color: grid },
      },
      y: {
        ticks: { color: tick },
        grid: { color: grid },
        beginAtZero: true,
      },
    },
  };
}

function chartHintForSubtype(st) {
  const base = "Metrics use weekly totals from completed sessions of this type. ";
  if (st === "treadmill" || st === "outdoor") {
    return (
      base +
      "Speed = km ÷ hours; pace = min/km (from your distance and time fields)."
    );
  }
  if (st === "ski-erg") {
    return (
      base +
      "Time = sum of logged duration. Pace /500m uses distance as km (Concept2-style: time for 500m as decimal minutes)."
    );
  }
  if (st === "rower") {
    return (
      base +
      "Distance = sum of logged km. Split /500m is derived from total time and distance for the week."
    );
  }
  return base;
}

function renderCharts(series, subtypeOverride) {
  if (!timelineOpen) return;
  destroyCharts();
  const st =
    subtypeOverride ||
    document.getElementById("cardio-type-select")?.value ||
    "treadmill";

  const hintEl = document.getElementById("charts-hint");
  if (hintEl) hintEl.textContent = chartHintForSubtype(st);

  const labels = series.map((s) => chartWeekLabel(s.weekKey));
  const round2 = (x) => (x != null ? Math.round(x * 100) / 100 : null);
  const round1 = (x) => (x != null ? Math.round(x * 10) / 10 : null);

  let data1;
  let data2;
  let label1 = "";
  let label2 = "";
  let chart1Type = "line";
  let chart2Type = "line";

  if (st === "treadmill" || st === "outdoor") {
    data1 = series.map((s) => round2(s.avgSpeedKmh));
    data2 = series.map((s) => round2(s.paceMinPerKm));
    label1 = "Average speed (km/h)";
    label2 = "Average pace (min/km)";
    chart1Type = "line";
    chart2Type = "line";
  } else if (st === "ski-erg") {
    data1 = series.map((s) => round1(s.timeMin));
    data2 = series.map((s) => round2(s.pace500Min));
    label1 = "Total time (minutes)";
    label2 = "Average pace /500m (min)";
    chart1Type = "bar";
    chart2Type = "line";
  } else if (st === "rower") {
    data1 = series.map((s) => round2(s.distanceKm));
    data2 = series.map((s) => round2(s.pace500Min));
    label1 = "Weekly distance (km)";
    label2 = "Average split /500m (min)";
    chart1Type = "line";
    chart2Type = "line";
  } else {
    data1 = [];
    data2 = [];
  }

  const hasData =
    data1.some((v) => v != null && v > 0) || data2.some((v) => v != null && v > 0);

  const emptyEl = document.getElementById("timeline-charts-empty");
  const w1 = document.getElementById("chart-wrap-1");
  const w2 = document.getElementById("chart-wrap-2");
  if (emptyEl) {
    if (!hasData) {
      emptyEl.classList.remove("hidden");
      [w1, w2].forEach((w) => w && w.classList.add("hidden"));
      return;
    }
    emptyEl.classList.add("hidden");
  }
  [w1, w2].forEach((w) => w && w.classList.remove("hidden"));

  const el1 = document.getElementById("chart-label-1");
  const el2 = document.getElementById("chart-label-2");
  if (el1) el1.textContent = label1;
  if (el2) el2.textContent = label2;

  const orange = "#ff6b35";
  const blue = "#3d8bfd";
  const cyan = "#7dd3fc";

  const cd = document.getElementById("chart-distance");
  const ct = document.getElementById("chart-time");
  if (!cd || !ct || typeof Chart === "undefined") return;

  const optsLine = chartDefaults();
  const optsBar = chartDefaults();

  chartDistance = new Chart(cd, {
    type: chart1Type,
    data: {
      labels,
      datasets: [
        {
          label: label1,
          data: data1,
          borderColor: chart1Type === "bar" ? blue : orange,
          backgroundColor:
            chart1Type === "bar" ? "rgba(61, 139, 253, 0.45)" : "rgba(255, 107, 53, 0.12)",
          fill: chart1Type === "line",
          tension: chart1Type === "line" ? 0.25 : 0,
          spanGaps: true,
          borderWidth: chart1Type === "bar" ? 1 : 2,
        },
      ],
    },
    options: chart1Type === "bar" ? optsBar : optsLine,
  });

  chartTime = new Chart(ct, {
    type: chart2Type,
    data: {
      labels,
      datasets: [
        {
          label: label2,
          data: data2,
          borderColor: st === "ski-erg" || st === "rower" ? cyan : blue,
          backgroundColor:
            chart2Type === "bar"
              ? "rgba(125, 211, 252, 0.35)"
              : "rgba(61, 139, 253, 0.1)",
          fill: chart2Type === "line",
          tension: chart2Type === "line" ? 0.25 : 0,
          spanGaps: true,
          borderWidth: chart2Type === "bar" ? 1 : 2,
        },
      ],
    },
    options: chart2Type === "bar" ? optsBar : optsLine,
  });
}

function buildTimelineWeeksHtml() {
  const start = ensureTrackingStartWeek();
  const end = raceWeekMondayIso();
  const weekKeys = weekKeysBetweenInclusive(start, end);
  const raceWk = raceWeekMondayIso();
  const today = isoToday();
  const raceDayIso = isoDate(new Date(2026, 6, 3, 12, 0, 0));

  return weekKeys
    .map((wk) => {
      const dayKeys = iterWeekDayKeys(wk);
      const isRace = wk === raceWk;
      const daysHtml = dayKeys
        .map((dk) => {
          const isToday = dk === today;
          const cls = ["timeline-day"];
          if (isToday) cls.push("timeline-day--today");
          if (dk === raceDayIso) cls.push("timeline-day--race");
          return `<span class="${cls.join(" ")}" title="${dk}">${shortWeekLabel(dk)}</span>`;
        })
        .join("");

      let badge = "";
      if (isRace) badge = '<span class="timeline-week__badge">Race week</span>';

      return `
        <div class="timeline-week ${isRace ? "timeline-week--race" : ""}">
          <div class="timeline-week__head">
            <span class="timeline-week__range">${weekRangeLabel(wk)}</span>
            ${badge}
          </div>
          <div class="timeline-week__days">${daysHtml}</div>
        </div>`;
    })
    .join("");
}

function updateSummary() {
  const el = document.getElementById("timeline-summary");
  if (!el) return;

  const now = Date.now();
  const end = HYROX_EVENT.getTime();
  let days = 0;
  let weeks = 0;
  if (now < end) {
    days = Math.ceil((end - now) / 86400000);
    weeks = Math.floor(days / 7);
  }

  const start = ensureTrackingStartWeek();
  const wkEnd = raceWeekMondayIso();
  const totalWeeks = weekKeysBetweenInclusive(start, wkEnd).length;

  el.innerHTML = `
    <strong>${days}</strong> calendar days and <strong>${weeks}</strong> full weeks until race start
    (7:00 AM AEST, 3 July 2026). Training window: <strong>${totalWeeks}</strong> week(s) from your tracking start through race week.
  `;
}

function openTimeline() {
  const modal = document.getElementById("timeline-modal");
  if (!modal) return;

  timelineOpen = true;

  updateSummary();

  const weeksEl = document.getElementById("timeline-weeks");
  if (weeksEl) weeksEl.innerHTML = buildTimelineWeeksHtml();

  aggregateCardioBySubtypeAndWeek().then((bySubtype) => {
    cachedCardioBySubtype = bySubtype;
    const select = document.getElementById("cardio-type-select");
    const preferred = select?.value || CARDIO_SUBTYPES[0].value;
    const hasPreferred =
      bySubtype[preferred] &&
      bySubtype[preferred].some(
        (row) => row.distanceKm > 0 || row.timeMin > 0
      );
    const subtype = hasPreferred ? preferred : firstSubtypeWithData(bySubtype);
    if (select) select.value = subtype;
    renderCharts(bySubtype[subtype] || [], subtype);
  });

  modal.hidden = false;
  document.body.classList.add("modal-open");

  const closeBtn = modal.querySelector("[data-close-timeline]");
  if (closeBtn && closeBtn.classList.contains("modal__close")) {
    closeBtn.focus();
  }
}

function closeTimeline() {
  const modal = document.getElementById("timeline-modal");
  if (!modal) return;
  timelineOpen = false;
  cachedCardioBySubtype = null;
  destroyCharts();
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  document.getElementById("btn-timeline")?.focus();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-timeline")?.addEventListener("click", openTimeline);

  document.querySelectorAll("[data-close-timeline]").forEach((el) => {
    el.addEventListener("click", closeTimeline);
  });

  document.getElementById("timeline-modal")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTimeline();
  });

  document.getElementById("cardio-type-select")?.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLSelectElement) || !cachedCardioBySubtype) return;
    const series = cachedCardioBySubtype[t.value];
    renderCharts(series || [], t.value);
  });
});
