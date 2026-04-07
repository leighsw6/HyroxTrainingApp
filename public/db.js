const DB_NAME = "hyroxTraining";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("weeks")) {
        db.createObjectStore("weeks", { keyPath: "weekKey" });
      }
    };
  });
}

function defaultWorkoutSlot() {
  return {
    workoutType: "",
    workoutDone: false,
    cardioSubtype: "",
    cardioDistance: "",
    cardioTime: "",
    /** Legacy / ski-erg & rower freeform; run types use computed pace from distance+time */
    cardioPace: "",
  };
}

function defaultDay() {
  return {
    rings: [false, false, false],
    workouts: [defaultWorkoutSlot(), defaultWorkoutSlot()],
  };
}

function normalizeWorkoutSlot(s) {
  const def = defaultWorkoutSlot();
  if (!s || typeof s !== "object") return { ...def };
  return {
    workoutType: s.workoutType ? String(s.workoutType) : "",
    workoutDone: !!s.workoutDone,
    cardioSubtype: s.cardioSubtype ? String(s.cardioSubtype) : "",
    cardioDistance: s.cardioDistance != null ? String(s.cardioDistance) : "",
    cardioTime: s.cardioTime != null ? String(s.cardioTime) : "",
    cardioPace: s.cardioPace != null ? String(s.cardioPace) : "",
  };
}

/** Normalize stored day: supports legacy flat workout* fields or `workouts` array. */
function normalizeDayFromStorage(d) {
  const def = defaultDay();
  if (!d || typeof d !== "object") return { ...def };
  const rings = d.rings || def.rings;
  const r = [!!rings[0], !!rings[1], !!rings[2]];
  if (Array.isArray(d.workouts) && d.workouts.length >= 1) {
    return {
      rings: r,
      workouts: [
        normalizeWorkoutSlot(d.workouts[0]),
        d.workouts.length >= 2 ? normalizeWorkoutSlot(d.workouts[1]) : defaultWorkoutSlot(),
      ],
    };
  }
  const w0 = normalizeWorkoutSlot({
    workoutType: d.workoutType,
    workoutDone: d.workoutDone,
    cardioSubtype: d.cardioSubtype,
    cardioDistance: d.cardioDistance,
    cardioTime: d.cardioTime,
    cardioPace: d.cardioPace,
  });
  return { rings: r, workouts: [w0, defaultWorkoutSlot()] };
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoLocal(s) {
  const [y, mo, day] = s.split("-").map(Number);
  return new Date(y, mo - 1, day, 12, 0, 0);
}

/** Shared cardio parsing (tracker + timeline). */
function hyroxParseDistanceKm(s) {
  if (s == null || !String(s).trim()) return 0;
  const str = String(s).replace(/,/g, ".");
  const m = str.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  let v = parseFloat(m[1]);
  if (/mi(le)?s?\b/i.test(str)) v *= 1.60934;
  return v;
}

/** Minutes as plain number, or MM:SS / H:MM:SS. */
function hyroxParseTimeToSeconds(s) {
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

/** Monday 00:00 local for the week containing `d`. */
function mondayOfLocalWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function iterWeekDayKeys(weekKey) {
  const mon = parseIsoLocal(weekKey);
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const t = new Date(mon);
    t.setDate(t.getDate() + i);
    keys.push(isoDate(t));
  }
  return keys;
}

async function idbGetWeek(weekKey) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("weeks", "readonly");
    const store = tx.objectStore("weeks");
    const r = store.get(weekKey);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result || null);
  });
}

async function idbPutWeek(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("weeks", "readwrite");
    const store = tx.objectStore("weeks");
    const r = store.put(record);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve();
  });
}

/** All stored weeks (for cloud merge). */
async function idbGetAllWeeks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("weeks", "readonly");
    const store = tx.objectStore("weeks");
    const r = store.getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result || []);
  });
}

async function getWeek(weekKey) {
  let local = null;
  try {
    local = await idbGetWeek(weekKey);
  } catch (e) {
    console.warn(
      "[Hyrox] IndexedDB read failed (common in file:// or locked previews). Use http://localhost or your live site.",
      e
    );
    window.hyroxIdbReadFailed = true;
  }
  if (typeof hyroxApplyCloudToWeek === "function") {
    try {
      return await hyroxApplyCloudToWeek(weekKey, local);
    } catch (e) {
      console.warn("[Hyrox] Cloud merge failed; using local data only.", e);
      return local;
    }
  }
  return local;
}

async function putWeek(record) {
  try {
    await idbPutWeek(record);
  } catch (e) {
    console.warn("[Hyrox] IndexedDB write failed; changes may not persist here.", e);
    window.hyroxIdbReadFailed = true;
  }
  if (typeof hyroxPushWeekToCloud === "function") {
    try {
      await hyroxPushWeekToCloud(record);
    } catch (e) {
      console.warn("Hyrox cloud sync failed (will retry on next save)", e);
    }
  }
}

async function getWeekOrDefault(weekKey) {
  try {
    const existing = await getWeek(weekKey);
    const days = {};
    for (const k of iterWeekDayKeys(weekKey)) {
      const d = existing?.days?.[k];
      if (d) {
        days[k] = normalizeDayFromStorage(d);
      } else {
        days[k] = defaultDay();
      }
    }
    return { weekKey, days };
  } catch (e) {
    console.warn("[Hyrox] getWeekOrDefault failed; showing empty week.", e);
    const days = {};
    for (const k of iterWeekDayKeys(weekKey)) {
      days[k] = defaultDay();
    }
    return { weekKey, days };
  }
}

function weekCompletionCount(week) {
  if (!week || !week.weekKey) return 0;
  const dayKeys = iterWeekDayKeys(week.weekKey);
  let rings = 0;
  let ceremony = 0;
  let weight = 0;
  let cardio = 0;
  let hyroxStyle = 0;
  let hyroxSim = 0;
  for (const d of dayKeys) {
    const day = week.days[d] || defaultDay();
    const r = day.rings || [false, false, false];
    rings += r.filter(Boolean).length;
    const w0 =
      day.workouts && day.workouts[0] != null
        ? normalizeWorkoutSlot(day.workouts[0])
        : normalizeWorkoutSlot({
            workoutType: day.workoutType,
            workoutDone: day.workoutDone,
            cardioSubtype: day.cardioSubtype,
            cardioDistance: day.cardioDistance,
            cardioTime: day.cardioTime,
            cardioPace: day.cardioPace,
          });
    if (w0.workoutDone && w0.workoutType === "ceremony") ceremony++;
    if (w0.workoutDone && w0.workoutType === "weight") weight++;
    if (w0.workoutDone && w0.workoutType === "cardio") cardio++;
    if (w0.workoutDone && w0.workoutType === "hyrox_style") hyroxStyle++;
    if (w0.workoutDone && w0.workoutType === "hyrox_sim") hyroxSim++;
  }
  return (
    rings +
    Math.min(1, ceremony) +
    Math.min(4, weight) +
    Math.min(2, cardio) +
    Math.min(1, hyroxStyle) +
    Math.min(1, hyroxSim)
  );
}

function weekKeysBetweenInclusive(startMondayIso, endMondayIso) {
  const keys = [];
  let cur = parseIsoLocal(startMondayIso);
  const end = parseIsoLocal(endMondayIso).getTime();
  while (cur.getTime() <= end) {
    keys.push(isoDate(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return keys;
}
