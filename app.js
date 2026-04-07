/**
 * Hyrox Sydney — morning of 3 July 2026 in Australia/Sydney.
 * 7:00 AM AEST (UTC+10; no daylight saving in July for NSW).
 */
const TARGET = new Date("2026-07-03T07:00:00+10:00");
const WINDOW_MS = 6 * 60 * 60 * 1000; // "race morning" window after start

const el = {
  d: document.getElementById("d"),
  h: document.getElementById("h"),
  m: document.getElementById("m"),
  s: document.getElementById("s"),
  localEquiv: document.getElementById("local-equiv"),
  stateBefore: document.getElementById("state-before"),
  stateDuring: document.getElementById("state-during"),
  stateAfter: document.getElementById("state-after"),
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatLocalSameInstant() {
  try {
    const s = TARGET.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    el.localEquiv.textContent = `That’s ${s} in your local time.`;
  } catch {
    el.localEquiv.textContent = "";
  }
}

function tick() {
  const now = Date.now();
  const start = TARGET.getTime();
  const end = start + WINDOW_MS;

  if (now >= end) {
    el.stateBefore.classList.add("hidden");
    el.stateDuring.classList.add("hidden");
    el.stateAfter.classList.remove("hidden");
    return;
  }

  if (now >= start) {
    el.stateBefore.classList.add("hidden");
    el.stateAfter.classList.add("hidden");
    el.stateDuring.classList.remove("hidden");
    return;
  }

  el.stateDuring.classList.add("hidden");
  el.stateAfter.classList.add("hidden");
  el.stateBefore.classList.remove("hidden");

  let remaining = start - now;
  const days = Math.floor(remaining / 86400000);
  remaining -= days * 86400000;
  const hours = Math.floor(remaining / 3600000);
  remaining -= hours * 3600000;
  const minutes = Math.floor(remaining / 60000);
  remaining -= minutes * 60000;
  const seconds = Math.floor(remaining / 1000);

  el.d.textContent = pad2(days);
  el.h.textContent = pad2(hours);
  el.m.textContent = pad2(minutes);
  el.s.textContent = pad2(seconds);
}

formatLocalSameInstant();
tick();
setInterval(tick, 1000);
