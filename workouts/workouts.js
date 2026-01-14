import { Storage } from "./lib/storage.js";
import { createWorkout, seedDemo, validateWorkout } from "./lib/model.js";
import { UI } from "./lib/ui.js";
import { initAudioPreferences, isMuted, toggleMuted } from "./lib/audio.js";

const store = new Storage();
const ui = new UI(store);

function boot() {
  ui.mount(document.getElementById("app"));
  // --- Mute global persistant ---
  initAudioPreferences();
  const btnMute = document.getElementById("btnMute");

  // --- THEMES (persistant) ---
  const THEME_KEY = "site:theme";
  const THEMES = ["dark", "light", "neon"];

  const btnTheme = document.getElementById("btnTheme");

  function applyTheme(theme) {
    const t = THEMES.includes(theme) ? theme : "dark";
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(THEME_KEY, t);

    if (btnTheme) {
      const label = t === "dark" ? "Dark" : t === "light" ? "Light" : "Neon";
      btnTheme.textContent = `Thème: ${label}`;
    }
  }

  function cycleTheme() {
    const cur = localStorage.getItem(THEME_KEY) || "dark";
    const idx = THEMES.indexOf(cur);
    const next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next);
  }

  // init
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  btnTheme?.addEventListener("click", cycleTheme);

  const refreshMuteUi = () => {
    const m = isMuted();
    btnMute.textContent = m ? "Son: OFF" : "Son: ON";
    btnMute.setAttribute("aria-pressed", m ? "true" : "false");
  };

  refreshMuteUi();

  btnMute.addEventListener("click", () => {
    toggleMuted();
    refreshMuteUi();
  });

  // Charger data
  const state = store.loadAll();
  ui.setState(state);

  // Nouvelle séance (overlay)
  document
    .getElementById("btnNewWorkout")
    .addEventListener("click", async () => {
      const res = await ui.openForm({
        title: "Créer une séance",
        note: "Donne un nom. Tu pourras tout modifier ensuite.",
        fields: [
          {
            key: "title",
            label: "Nom de la séance",
            type: "text",
            value: "Nouvelle séance",
            required: true,
          },
        ],
        confirmText: "Créer",
        cancelText: "Annuler",
      });
      if (!res) return;

      const w = createWorkout(res.title);
      store.upsert(w);
      ui.setState(store.loadAll());
      ui.selectWorkout(w.id);
      ui.toast("Séance créée", w.title);
    });

  document.getElementById("btnSeedDemo").addEventListener("click", () => {
    const w = seedDemo();
    store.upsert(w);
    ui.setState(store.loadAll());
    ui.selectWorkout(w.id);
    ui.toast("Démo ajoutée", w.title);
  });

  document.getElementById("btnExport").addEventListener("click", () => {
    const payload = store.exportAll();
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workouts-export-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.toast("Export généré", "Fichier JSON téléchargé.");
  });

  document
    .getElementById("fileImport")
    .addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        store.importAll(parsed);
        ui.setState(store.loadAll());
        e.target.value = "";
        ui.toast("Import OK", "Séances fusionnées.");
      } catch (err) {
        console.error(err);
        ui.toast("Import invalide", "JSON incorrect.", { danger: true });
      }
    });

  // Validate everything once
  for (const w of store.loadAll()) {
    const issues = validateWorkout(w);
    if (issues.length) {
      console.warn("Workout invalid:", w.id, issues);
    }
  }
}

boot();
