/**
 * Cross-device sync: Firebase Auth (Google) + Firestore.
 * Requires firebase-config.js (HYROX_FIREBASE_CONFIG), compat SDKs, and db.js.
 *
 * Example Firestore rules:
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /users/{userId}/{document=**} {
 *       allow read, write: if request.auth != null && request.auth.uid == userId;
 *     }
 *   }
 * }
 */

const LS_TRACK_START = "hyrox_tracking_start_week";

let hyroxDb = null;
let hyroxAuth = null;
const remoteWeekMem = new Map();

function hyroxCloudReady() {
  return !!(hyroxAuth && hyroxAuth.currentUser && window.HYROX_FIREBASE_CONFIG);
}

function pickNonEmpty(a, b) {
  const sa = a == null || a === "" ? "" : String(a);
  const sb = b == null || b === "" ? "" : String(b);
  return sa.length >= sb.length ? sa : sb;
}

function mergeDay(a, b) {
  const A = a || defaultDay();
  const B = b || defaultDay();
  const rA = A.rings || defaultDay().rings;
  const rB = B.rings || defaultDay().rings;
  return {
    rings: [!!rA[0] || !!rB[0], !!rA[1] || !!rB[1], !!rA[2] || !!rB[2]],
    workoutType: A.workoutType || B.workoutType || "",
    workoutDone: !!A.workoutDone || !!B.workoutDone,
    cardioSubtype: A.cardioSubtype || B.cardioSubtype || "",
    cardioDistance: pickNonEmpty(A.cardioDistance, B.cardioDistance),
    cardioTime: pickNonEmpty(A.cardioTime, B.cardioTime),
    cardioPace: pickNonEmpty(A.cardioPace, B.cardioPace),
  };
}

function mergeWeekData(weekKey, localRaw, remoteRaw) {
  const keys = iterWeekDayKeys(weekKey);
  const L = localRaw && localRaw.days ? localRaw.days : {};
  const R = remoteRaw && remoteRaw.days ? remoteRaw.days : {};
  const days = {};
  for (const k of keys) {
    days[k] = mergeDay(L[k], R[k]);
  }
  return { weekKey, days };
}

function sanitizeForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function hyroxApplyCloudToWeek(weekKey, local) {
  if (!hyroxCloudReady()) return local;
  const uid = hyroxAuth.currentUser.uid;
  const ref = hyroxDb.collection("users").doc(uid).collection("weeks").doc(weekKey);
  let remote = null;
  if (remoteWeekMem.has(weekKey)) {
    remote = remoteWeekMem.get(weekKey);
  } else {
    const snap = await ref.get();
    if (snap.exists) {
      remote = snap.data();
      remoteWeekMem.set(weekKey, remote);
    }
  }
  if (!remote || !remote.days) return local;
  const merged = mergeWeekData(weekKey, local, remote);
  await idbPutWeek(merged);
  return merged;
}

async function hyroxPushWeekToCloud(record) {
  if (!hyroxCloudReady()) return;
  const uid = hyroxAuth.currentUser.uid;
  const payload = sanitizeForFirestore(record);
  /* Full document replace so nested `days` never partially merge with stale fields. */
  await hyroxDb.collection("users").doc(uid).collection("weeks").doc(record.weekKey).set(payload);
  remoteWeekMem.set(record.weekKey, payload);
}

async function hyroxPullProfile() {
  if (!hyroxCloudReady()) return;
  const uid = hyroxAuth.currentUser.uid;
  const ref = hyroxDb.collection("users").doc(uid).collection("meta").doc("profile");
  const snap = await ref.get();
  if (snap.exists && snap.data().trackingStartWeek) {
    localStorage.setItem(LS_TRACK_START, snap.data().trackingStartWeek);
  }
}

async function hyroxPushProfile() {
  if (!hyroxCloudReady()) return;
  const uid = hyroxAuth.currentUser.uid;
  const start = localStorage.getItem(LS_TRACK_START);
  if (!start) return;
  await hyroxDb.collection("users").doc(uid).collection("meta").doc("profile").set(
    { trackingStartWeek: start },
    { merge: true }
  );
}

async function hyroxFullMergeSync() {
  if (!hyroxCloudReady()) return;
  const uid = hyroxAuth.currentUser.uid;
  remoteWeekMem.clear();
  const localWeeks = await idbGetAllWeeks();
  const snap = await hyroxDb.collection("users").doc(uid).collection("weeks").get();
  const remoteByKey = new Map();
  snap.forEach((doc) => {
    remoteByKey.set(doc.id, doc.data());
  });
  const allKeys = new Set([...localWeeks.map((w) => w.weekKey), ...remoteByKey.keys()]);
  for (const weekKey of allKeys) {
    const local = localWeeks.find((w) => w.weekKey === weekKey) || null;
    const remote = remoteByKey.get(weekKey) || null;
    const merged = mergeWeekData(weekKey, local, remote);
    await idbPutWeek(merged);
    await hyroxDb
      .collection("users")
      .doc(uid)
      .collection("weeks")
      .doc(weekKey)
      .set(sanitizeForFirestore(merged));
    remoteWeekMem.set(weekKey, merged);
  }
  await hyroxPullProfile();
  if (!localStorage.getItem(LS_TRACK_START)) {
    const p = await hyroxDb.collection("users").doc(uid).collection("meta").doc("profile").get();
    if (p.exists && p.data().trackingStartWeek) {
      localStorage.setItem(LS_TRACK_START, p.data().trackingStartWeek);
    }
  }
  await hyroxPushProfile();
  window.dispatchEvent(new CustomEvent("hyrox-synced"));
}

/** Pop-up auth often fails on GitHub Pages; redirect is reliable there and on mobile. */
function hyroxUseAuthRedirect() {
  const host = window.location.hostname || "";
  if (host.endsWith(".github.io") || host === "localhost" || host === "127.0.0.1") {
    return true;
  }
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent || ""
  );
}

function hyroxFormatAuthError(e) {
  const code = e && e.code ? String(e.code) : "";
  const msg = e && e.message ? String(e.message) : String(e);
  let hint = "";
  if (code === "auth/unauthorized-domain") {
    hint =
      " Firebase → Authentication → Settings → Authorized domains must include: " +
      (window.location.hostname || "this host");
  } else if (code === "auth/operation-not-allowed") {
    hint = " Enable Google under Firebase → Authentication → Sign-in method.";
  }
  return `${code ? `${code}: ` : ""}${msg}${hint}`;
}

async function hyroxInitAuthUi() {
  const btnIn = document.getElementById("btn-sign-in");
  const btnOut = document.getElementById("btn-sign-out");
  const status = document.getElementById("auth-status");
  const debug = typeof window !== "undefined" && window.location.search && window.location.search.indexOf("hyrox_auth_debug=1") >= 0;

  function refresh() {
    const u = hyroxAuth && hyroxAuth.currentUser;
    if (status) {
      if (status.dataset.redirectError !== "1") {
        status.textContent = u ? `Signed in: ${u.email || u.uid.slice(0, 8)}…` : "";
        status.classList.toggle("hidden", !u);
      }
    }
    if (btnIn) btnIn.classList.toggle("hidden", !!u);
    if (btnOut) btnOut.classList.toggle("hidden", !u);
  }

  function wireButtons() {
    if (btnIn) {
      btnIn.addEventListener("click", async () => {
        if (status && status.dataset.redirectError === "1") {
          status.dataset.redirectError = "";
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
          await hyroxAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
          if (hyroxUseAuthRedirect()) {
            await hyroxAuth.signInWithRedirect(provider);
            return;
          }
          await hyroxAuth.signInWithPopup(provider);
        } catch (e) {
          console.error(e);
          const code = e && e.code ? String(e.code) : "";
          const msg = e && e.message ? String(e.message) : String(e);
          let hint =
            "If this is auth/unauthorized-domain: Firebase → Authentication → Settings → Authorized domains must include exactly: " +
            (window.location.hostname || "this site");
          hint +=
            ". Also in Google Cloud Console → APIs & Services → Credentials → your Web client → Authorized JavaScript origins, add https://" +
            (window.location.hostname || "yoursite.github.io");
          alert(`Sign-in failed (${code || "error"})\n\n${msg}\n\n${hint}`);
        }
      });
    }
    if (btnOut) {
      btnOut.addEventListener("click", () => hyroxAuth.signOut());
    }
  }

  /* Subscribe before getRedirectResult so we never miss the post-redirect user state. */
  hyroxAuth.onAuthStateChanged(async (user) => {
    if (user && status && status.dataset.redirectError === "1") {
      status.dataset.redirectError = "";
    }
    refresh();
    try {
      if (user) {
        await hyroxFullMergeSync();
      } else {
        remoteWeekMem.clear();
      }
    } catch (e) {
      console.error("[Hyrox] Cloud sync after auth failed", e);
      if (status && user) {
        status.textContent = `Signed in, but sync failed: ${e.message || e}`;
        status.classList.remove("hidden");
      }
    } finally {
      window.dispatchEvent(new CustomEvent("hyrox-auth-changed"));
    }
  });

  wireButtons();

  try {
    const result = await hyroxAuth.getRedirectResult();
    if (debug) {
      console.info("[Hyrox] getRedirectResult", {
        hasCredential: !!(result && result.credential),
        hasUser: !!(result && result.user),
        currentUser: !!(hyroxAuth && hyroxAuth.currentUser),
      });
    }
    if (result && result.user) {
      console.log("[Hyrox] Redirect sign-in completed.");
      if (status && status.dataset.redirectError === "1") {
        status.dataset.redirectError = "";
      }
      try {
        await hyroxFullMergeSync();
      } catch (e) {
        console.error("[Hyrox] Cloud sync right after redirect failed", e);
        if (status) {
          status.textContent = `Signed in, but sync failed: ${e.message || e}`;
          status.classList.remove("hidden");
        }
      }
      refresh();
      window.dispatchEvent(new CustomEvent("hyrox-auth-changed"));
    }
  } catch (e) {
    console.error("[Hyrox] getRedirectResult failed", e);
    if (status) {
      status.textContent = hyroxFormatAuthError(e);
      status.classList.remove("hidden");
      status.dataset.redirectError = "1";
    }
  }

  if (typeof hyroxAuth.authStateReady === "function") {
    try {
      await hyroxAuth.authStateReady();
    } catch (e) {
      console.warn("[Hyrox] authStateReady", e);
    }
  }

  refresh();
}

function hyroxInitFirebase() {
  const cfg = window.HYROX_FIREBASE_CONFIG;
  const bar = document.getElementById("auth-bar");
  const hint = document.getElementById("firebase-config-missing");
  if (!cfg || !cfg.apiKey || !cfg.projectId) {
    if (bar) bar.classList.add("hidden");
    if (hint) hint.classList.remove("hidden");
    return;
  }
  if (hint) hint.classList.add("hidden");
  if (typeof firebase === "undefined") {
    console.warn("Firebase SDK not loaded; cloud sync disabled.");
    if (bar) bar.classList.add("hidden");
    return;
  }
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(cfg);
    }
    hyroxAuth = firebase.auth();
    hyroxDb = firebase.firestore();
  } catch (e) {
    console.error("[Hyrox] Firebase init failed; tracker still works locally.", e);
    if (bar) bar.classList.add("hidden");
    if (hint) hint.classList.remove("hidden");
    if (hint) {
      hint.textContent =
        "Firebase failed to initialize. Check firebase-config.js. Training UI still works; fix config for cloud sync.";
    }
    return;
  }
  if (bar) {
    bar.classList.remove("hidden", "auth-bar--pending");
  }
  hyroxInitAuthUi().catch((e) => console.error("[Hyrox] Auth UI init failed", e));
}

/* Init as soon as DOM is ready (defer scripts run before DOMContentLoaded). Starts auth before tracker’s first render. */
function hyroxBootCloud() {
  hyroxInitFirebase();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hyroxBootCloud);
} else {
  hyroxBootCloud();
}
