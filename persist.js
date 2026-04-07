/**
 * Save / load training data as files (JSON or Markdown with embedded JSON).
 * Static hosting cannot write into the Git repo; you commit the downloaded file yourself.
 */

function hyroxTriggerDownload(filename, mime, body) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function hyroxParseImportText(text) {
  const t = text.trim();
  if (t.startsWith("{")) {
    return JSON.parse(t);
  }
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) {
    return JSON.parse(m[1].trim());
  }
  throw new Error('No JSON found. Use a .json file, or Markdown containing a ```json ... ``` block.');
}

function hyroxBuildMarkdownExport(snapshot) {
  const json = JSON.stringify(snapshot, null, 2);
  const start = snapshot.trackingStartWeek || "—";
  return [
    "# Hyrox training data",
    "",
    `Exported **${snapshot.exportedAt}**. Tracking start week: \`${start}\`.`,
    "",
    "Re-import in the app with **Load from file** using this `.md` file (the JSON block below is required).",
    "",
    "```json",
    json,
    "```",
    "",
  ].join("\n");
}

function hyroxBindPersistUi() {
  const saveJson = document.getElementById("btn-save-json");
  const saveMd = document.getElementById("btn-save-md");
  const loadBtn = document.getElementById("btn-load-file");
  const fileInput = document.getElementById("hyrox-file-import");

  if (saveJson) {
    saveJson.addEventListener("click", async () => {
      try {
        const snap = await hyroxExportSnapshot();
        const day = snap.exportedAt.slice(0, 10);
        hyroxTriggerDownload(`hyrox-training-${day}.json`, "application/json", JSON.stringify(snap, null, 2));
      } catch (e) {
        console.error(e);
        alert(`Save failed: ${e.message || e}`);
      }
    });
  }

  if (saveMd) {
    saveMd.addEventListener("click", async () => {
      try {
        const snap = await hyroxExportSnapshot();
        const day = snap.exportedAt.slice(0, 10);
        hyroxTriggerDownload(`hyrox-training-${day}.md`, "text/markdown;charset=utf-8", hyroxBuildMarkdownExport(snap));
      } catch (e) {
        console.error(e);
        alert(`Save failed: ${e.message || e}`);
      }
    });
  }

  if (loadBtn && fileInput) {
    loadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const input = e.target;
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      let text;
      try {
        text = await file.text();
      } catch (err) {
        alert(`Could not read file: ${err.message || err}`);
        return;
      }
      let data;
      try {
        data = hyroxParseImportText(text);
      } catch (err) {
        alert(`Could not parse file: ${err.message || err}`);
        return;
      }
      try {
        await hyroxImportSnapshot(data);
        window.dispatchEvent(new CustomEvent("hyrox-imported"));
      } catch (err) {
        alert(`Import failed: ${err.message || err}`);
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  hyroxBindPersistUi();
});
