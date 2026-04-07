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

function defaultDay() {
  return {
    rings: [false, false, false],
    workoutType: "",
    workoutDone: false,
    cardioSubtype: "",
    cardioDistance: "",
    cardioTime: "",
    cardioPace: "",
  };
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
        const r = d.rings || defaultDay().rings;
        days[k] = {
          rings: [!!r[0], !!r[1], !!r[2]],
          workoutType: d.workoutType || "",
          workoutDone: !!d.workoutDone,
          cardioSubtype: d.cardioSubtype || "",
          cardioDistance: d.cardioDistance ?? "",
          cardioTime: d.cardioTime ?? "",
          cardioPace: d.cardioPace ?? "",
        };
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
    if (day.workoutDone && day.workoutType === "ceremony") ceremony++;
    if (day.workoutDone && day.workoutType === "weight") weight++;
    if (day.workoutDone && day.workoutType === "cardio") cardio++;
    if (day.workoutDone && day.workoutType === "hyrox_style") hyroxStyle++;
    if (day.workoutDone && day.workoutType === "hyrox_sim") hyroxSim++;
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
