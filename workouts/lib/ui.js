import {
  createBlock,
  createExercise,
  defaultSetHold,
  defaultSetReps,
} from "./model.js";
import { flattenWorkout } from "./flatten.js";
import { Countdown, fmtTime, IntervalTimer } from "./timers.js";
import { beep, tripleBeep } from "./audio.js";
import { requestWakeLock, releaseWakeLock } from "./wake.js";

export class UI {
  constructor(store) {
    this.store = store;
    this.state = [];
    this.selectedWorkoutId = null;
    this.currentWorkout = null;

    this.autoRun = false; // enchaînement auto activé
    this.isPaused = false; // pause volontaire

    // editor selection
    this.selectedNodeId = null;

    // runner
    this.steps = [];
    this.stepIndex = 0;
    this.globalTimer = null;
    this.stepMode = "idle";
    this.stepCountdown = null;

    // EMOM runtime
    this.emomRoundStartAt = new Map();
    this.stopHold = { downAt: 0, armed: false };

    this.el = {};
    this._toastId = 0;
  }

  mount(root) {
    this.root = root;

    // tabs
    root.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => this.showTab(btn.dataset.tab));
    });

    // library elements
    this.el.grid = root.querySelector("#workoutGrid");
    this.el.detailsEmpty = root.querySelector("#workoutDetailsEmpty");
    this.el.details = root.querySelector("#workoutDetails");

    // editor elements
    this.el.editorTitle = root.querySelector("#editorTitle");
    this.el.tree = root.querySelector("#tree");
    this.el.props = root.querySelector("#props");
    this.el.btnDeleteNode = root.querySelector("#btnDeleteNode");

    root
      .querySelector("#btnBackToLibrary1")
      .addEventListener("click", () => this.goLibrary());
    root
      .querySelector("#btnSaveWorkout")
      .addEventListener("click", () => this.saveWorkout());

    root
      .querySelector("#btnAddBlock")
      .addEventListener("click", () => this.addNode("block"));
    root
      .querySelector("#btnAddEmom")
      .addEventListener("click", () => this.addNode("emom"));
    root
      .querySelector("#btnAddExercise")
      .addEventListener("click", () => this.addNode("exercise"));
    root
      .querySelector("#btnDeleteNode")
      .addEventListener("click", () => this.deleteSelectedNode());

    // runner elements
    this.el.runTitle = root.querySelector("#runTitle");
    this.el.runSub = root.querySelector("#runSub");
    this.el.globalTime = root.querySelector("#globalTime");
    this.el.stepBadge = root.querySelector("#stepBadge");
    this.el.stepTitle = root.querySelector("#stepTitle");
    this.el.stepDesc = root.querySelector("#stepDesc");
    this.el.primaryLabel = root.querySelector("#primaryLabel");
    this.el.primaryTime = root.querySelector("#primaryTime");
    this.el.progressText = root.querySelector("#progressText");
    this.el.queueList = root.querySelector("#queueList");
    this.el.hint = root.querySelector("#hintText");

    root
      .querySelector("#btnBackToLibrary2")
      .addEventListener("click", () => this.stopAndReturn());

    this.el.btnStartStep = root.querySelector("#btnStartStep");
    this.el.btnRestartStep = root.querySelector("#btnRestartStep");
    this.el.btnPrevStep = root.querySelector("#btnPrevStep");
    this.el.btnSkipStep = root.querySelector("#btnSkipStep");
    this.el.btnToggleDesc = root.querySelector("#btnToggleDesc");
    this.el.btnStop = root.querySelector("#btnStop");

    this.el.btnStartStep.addEventListener("click", () =>
      this.startCurrentStep()
    );
    this.el.btnRestartStep.addEventListener("click", () =>
      this.restartCurrentStep()
    );
    this.el.btnPrevStep.addEventListener("click", () => this.prevStep());
    this.el.btnSkipStep.addEventListener("click", () => this.skipStep());
    this.el.btnToggleDesc.addEventListener("click", () => this.toggleDesc());

    // overlay & toasts
    this.el.toastHost = root.querySelector("#toastHost");
    this.el.overlay = root.querySelector("#overlay");
    this.el.ovTitle = root.querySelector("#ovTitle");
    this.el.ovBody = root.querySelector("#ovBody");
    this.el.ovActions = root.querySelector("#ovActions");
    this.el.ovClose = root.querySelector("#ovClose");

    this.el.ovClose.addEventListener("click", () => this.closeOverlay(null));
    this.el.overlay.addEventListener("click", (e) => {
      if (e.target === this.el.overlay) this.closeOverlay(null);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.el.overlay.hidden)
        this.closeOverlay(null);
    });

    // STOP: maintenir puis overlay confirm
    this.el.btnStop.addEventListener("pointerdown", () => {
      this.stopHold.downAt = performance.now();
      this.stopHold.armed = false;
      this.el.btnStop.textContent = "STOP (maintenir)";
      const tick = () => {
        if (this.stopHold.downAt === 0) return;
        const dt = performance.now() - this.stopHold.downAt;
        if (dt >= 1200 && !this.stopHold.armed) {
          this.stopHold.armed = true;
          this.el.btnStop.textContent = "STOP (ok)";
          beep(660, 120, 0.07);

          this.openConfirm({
            title: "Arrêter la séance ?",
            message:
              "Double validation anti-erreur. Si tu confirmes, le chrono global s'arrête.",
            confirmText: "Arrêter",
            cancelText: "Annuler",
            danger: true,
          }).then((ok) => {
            this.el.btnStop.textContent = "STOP";
            this.stopHold.downAt = 0;
            if (ok) {
              this.stopRunner(true);
              this.goLibrary();
              this.toast("Séance arrêtée", "", { danger: true });
            }
          });
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });

    this.el.btnStop.addEventListener("pointerup", () => {
      this.stopHold.downAt = 0;
      this.el.btnStop.textContent = "STOP";
    });
    this.el.btnStop.addEventListener("pointercancel", () => {
      this.stopHold.downAt = 0;
      this.el.btnStop.textContent = "STOP";
    });
  }

  setState(list) {
    this.state = list;
    this.renderLibrary();
    this.updateTabs();
  }

  updateTabs() {
    const editorTab = this.root.querySelector('.tab[data-tab="editor"]');
    const runnerTab = this.root.querySelector('.tab[data-tab="runner"]');
    editorTab.disabled = !this.currentWorkout;
    runnerTab.disabled = !this.currentWorkout;
  }

  showTab(name) {
    this.root
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    this.root
      .querySelectorAll(".tab")
      .forEach((t) =>
        t.setAttribute("aria-selected", String(t.dataset.tab === name))
      );
    this.root
      .querySelectorAll(".view")
      .forEach((v) => v.classList.toggle("is-active", v.dataset.view === name));
  }

  goLibrary() {
    this.currentWorkout = null;
    this.selectedNodeId = null;
    this.updateTabs();
    this.showTab("library");
    this.renderLibrary();
  }

  selectWorkout(id) {
    this.selectedWorkoutId = id;
    const w = this.state.find((x) => x.id === id) || null;
    this.renderLibraryDetails(w);
  }

  renderLibrary() {
    const grid = this.el.grid;
    grid.innerHTML = "";

    for (const w of this.state) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-head">
          <div class="badge">Séance</div>
          <div class="step-title">${escapeHtml(w.title)}</div>
        </div>
        <div class="small">Maj: ${escapeHtml(
          (w.updatedAt || "").slice(0, 16).replace("T", " ")
        )}</div>
      `;
      card.addEventListener("click", () => this.selectWorkout(w.id));
      grid.appendChild(card);
    }
  }

  renderLibraryDetails(workout) {
    if (!workout) {
      this.el.detailsEmpty.hidden = false;
      this.el.details.hidden = true;
      return;
    }
    this.el.detailsEmpty.hidden = true;
    this.el.details.hidden = false;

    const steps = flattenWorkout(workout);
    this.el.details.innerHTML = `
      <div class="k">Nom</div>
      <h3>${escapeHtml(workout.title)}</h3>
      <div class="k">Étapes (après flatten)</div>
      <div>${steps.length}</div>

      <div class="row-actions">
        <button class="btn" id="btnLaunch">Lancer</button>
        <button class="btn btn-ghost" id="btnEdit">Éditer</button>
        <button class="btn btn-danger" id="btnDeleteWorkout">Supprimer</button>
      </div>
    `;

    this.el.details
      .querySelector("#btnLaunch")
      .addEventListener("click", () => {
        this.currentWorkout = structuredClone(workout);
        this.startRunner();
        this.updateTabs();
        this.showTab("runner");
      });

    this.el.details.querySelector("#btnEdit").addEventListener("click", () => {
      this.currentWorkout = structuredClone(workout);
      this.selectedNodeId = this.currentWorkout.root.id;
      this.updateTabs();
      this.showTab("editor");
      this.renderEditor();
    });

    this.el.details
      .querySelector("#btnDeleteWorkout")
      .addEventListener("click", async () => {
        const ok = await this.openConfirm({
          title: "Supprimer la séance ?",
          message: `Cette action est irréversible.\n\nSéance: ${workout.title}`,
          confirmText: "Supprimer",
          cancelText: "Annuler",
          danger: true,
        });
        if (!ok) return;

        this.store.remove(workout.id);
        this.setState(this.store.loadAll());
        this.renderLibraryDetails(null);
        this.toast("Séance supprimée", workout.title, { danger: true });
      });
  }

  saveWorkout() {
    if (!this.currentWorkout) return;
    this.currentWorkout.updatedAt = new Date().toISOString();
    this.store.upsert(this.currentWorkout);
    this.setState(this.store.loadAll());
    this.toast("Sauvegardé", this.currentWorkout.title);
  }

  // -------------------------
  // EDITOR
  // -------------------------
  renderEditor() {
    if (!this.currentWorkout) return;
    this.el.editorTitle.textContent = `Éditeur — ${this.currentWorkout.title}`;
    this.renderTree();
    this.renderProps();
  }

  renderTree() {
    const root = this.currentWorkout.root;
    this.el.tree.innerHTML = "";
    const nodeEl = this.renderNodeRecursive(root, null);
    this.el.tree.appendChild(nodeEl);
  }

  renderNodeRecursive(node, parent) {
    const wrap = document.createElement("div");

    const row = document.createElement("div");
    row.className =
      "node" + (node.id === this.selectedNodeId ? " is-selected" : "");
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      this.selectedNodeId = node.id;
      this.el.btnDeleteNode.disabled = node.id === this.currentWorkout.root.id;
      this.renderEditor();
    });

    const left = document.createElement("div");
    left.className = "node-left";

    const type = document.createElement("div");
    type.className = "node-type";
    type.textContent =
      node.type === "block" ? (node.kind === "emom" ? "E" : "B") : "X";

    const title = document.createElement("div");
    const subtitle = document.createElement("div");
    subtitle.className = "node-sub";

    if (node.type === "block") {
      title.className = "node-title";
      title.textContent = node.title;
      const tail = [];
      if ((node.restEndSec || 0) > 0)
        tail.push(`rest fin: ${node.restEndSec}s`);
      if (node.kind === "emom")
        tail.push(
          `EMOM: ${node.emom?.rounds || 0}x${node.emom?.intervalSec || 0}s`
        );
      subtitle.textContent = tail.join(" • ");
    } else {
      title.className = "node-title";
      title.textContent = node.name;
      const sets = Array.isArray(node.sets) ? node.sets.length : 0;
      subtitle.textContent = `${sets} série(s)`;
    }

    left.append(
      type,
      (() => {
        const t = document.createElement("div");
        t.append(title, subtitle);
        return t;
      })()
    );

    const actions = document.createElement("div");
    actions.className = "node-actions";

    if (parent) {
      const up = document.createElement("button");
      up.className = "iconbtn";
      up.textContent = "↑";
      up.title = "Monter";
      up.addEventListener("click", (e) => {
        e.stopPropagation();
        this.moveNode(parent.id, node.id, -1);
      });

      const down = document.createElement("button");
      down.className = "iconbtn";
      down.textContent = "↓";
      down.title = "Descendre";
      down.addEventListener("click", (e) => {
        e.stopPropagation();
        this.moveNode(parent.id, node.id, +1);
      });

      actions.append(up, down);
    }

    row.append(left, actions);
    wrap.appendChild(row);

    if (node.type === "block" && (node.nodes?.length || 0) > 0) {
      const children = document.createElement("div");
      children.className = "children";
      for (const child of node.nodes) {
        children.appendChild(this.renderNodeRecursive(child, node));
      }
      wrap.appendChild(children);
    }

    return wrap;
  }

  findNodeById(node, id, parent = null) {
    if (node.id === id) return { node, parent };
    if (node.type === "block") {
      for (const child of node.nodes || []) {
        const res = this.findNodeById(child, id, node);
        if (res) return res;
      }
    }
    return null;
  }

  async addNode(kind) {
    if (!this.currentWorkout) return;
    const root = this.currentWorkout.root;
    const selected = this.findNodeById(root, this.selectedNodeId || root.id);
    const target =
      selected?.node?.type === "block"
        ? selected.node
        : selected?.parent || root;

    // UX: pas de popup. On crée direct avec un nom par défaut, renommage dans "Propriétés".
    // Option: si tu veux forcer le nom à la création, décommente la version openForm ci-dessous.
    if (kind === "block") {
      const b = createBlock("Bloc", { kind: "block", restEndSec: 0 });
      target.nodes.push(b);
      this.toast("Bloc ajouté", "Renomme-le dans Propriétés.");
    } else if (kind === "emom") {
      const b = createBlock("EMOM", { kind: "emom", restEndSec: 0 });
      b.emom.intervalSec = 60;
      b.emom.rounds = 10;
      target.nodes.push(b);
      this.toast(
        "EMOM ajouté",
        "Configure intervalle + rounds dans Propriétés."
      );
    } else if (kind === "exercise") {
      const ex = createExercise("Exercice");
      target.nodes.push(ex);
      this.toast(
        "Exercice ajouté",
        "Renomme-le et configure les séries dans Propriétés."
      );
    }

    this.currentWorkout.updatedAt = new Date().toISOString();
    this.renderEditor();
  }

  async deleteSelectedNode() {
    if (!this.currentWorkout || !this.selectedNodeId) return;
    const root = this.currentWorkout.root;
    if (this.selectedNodeId === root.id) return;

    const found = this.findNodeById(root, this.selectedNodeId);
    if (!found || !found.parent) return;

    const label =
      found.node.type === "block"
        ? `Bloc: ${found.node.title}`
        : `Exercice: ${found.node.name}`;

    const ok = await this.openConfirm({
      title: "Supprimer ce nœud ?",
      message: `Cela supprime aussi tous ses enfants.\n\n${label}`,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      danger: true,
    });
    if (!ok) return;

    found.parent.nodes = found.parent.nodes.filter(
      (n) => n.id !== this.selectedNodeId
    );
    this.selectedNodeId = root.id;
    this.el.btnDeleteNode.disabled = true;
    this.currentWorkout.updatedAt = new Date().toISOString();
    this.renderEditor();
    this.toast("Nœud supprimé", label, { danger: true });
  }

  moveNode(parentId, nodeId, delta) {
    const root = this.currentWorkout.root;
    const parentFound = this.findNodeById(root, parentId);
    if (!parentFound || parentFound.node.type !== "block") return;
    const arr = parentFound.node.nodes;
    const idx = arr.findIndex((n) => n.id === nodeId);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= arr.length) return;
    const tmp = arr[idx];
    arr[idx] = arr[next];
    arr[next] = tmp;
    this.currentWorkout.updatedAt = new Date().toISOString();
    this.renderEditor();
  }

  renderProps() {
    if (!this.currentWorkout) return;
    const root = this.currentWorkout.root;
    const found = this.findNodeById(root, this.selectedNodeId || root.id);
    const node = found?.node;
    if (!node) {
      this.el.props.innerHTML = `<div class="empty">Sélection invalide.</div>`;
      return;
    }

    if (node.type === "block") {
      this.el.props.innerHTML = `
        <div class="field">
          <label>Titre</label>
          <input id="p_title" value="${escapeAttr(node.title)}" />
        </div>

        <div class="field">
          <label>Repos fin de bloc (sec)</label>
          <input id="p_restEnd" type="number" min="0" step="5" value="${Number(
            node.restEndSec || 0
          )}" />
        </div>

        ${
          node.kind === "emom"
            ? `
          <div class="hr"></div>
          <div class="field">
            <label>EMOM — Intervalle (sec)</label>
            <input id="p_emomInterval" type="number" min="10" step="5" value="${Number(
              node.emom?.intervalSec || 60
            )}" />
            <div class="mini">Le runner attend la fin de l’interval après les exos.</div>
          </div>
          <div class="field">
            <label>EMOM — Rounds</label>
            <input id="p_emomRounds" type="number" min="1" step="1" value="${Number(
              node.emom?.rounds || 10
            )}" />
          </div>
        `
            : ``
        }
      `;

      this.el.props.querySelector("#p_title").addEventListener("input", (e) => {
        node.title = e.target.value;
        this.currentWorkout.updatedAt = new Date().toISOString();
        this.renderTree();
      });
      this.el.props
        .querySelector("#p_restEnd")
        .addEventListener("input", (e) => {
          node.restEndSec = clampInt(e.target.value, 0, 99999);
          this.currentWorkout.updatedAt = new Date().toISOString();
          this.renderTree();
        });

      if (node.kind === "emom") {
        this.el.props
          .querySelector("#p_emomInterval")
          .addEventListener("input", (e) => {
            node.emom.intervalSec = clampInt(e.target.value, 10, 9999);
            this.currentWorkout.updatedAt = new Date().toISOString();
            this.renderTree();
          });
        this.el.props
          .querySelector("#p_emomRounds")
          .addEventListener("input", (e) => {
            node.emom.rounds = clampInt(e.target.value, 1, 9999);
            this.currentWorkout.updatedAt = new Date().toISOString();
            this.renderTree();
          });
      }
      return;
    }

    // exercise props
    const sets = Array.isArray(node.sets) ? node.sets : [];
    this.el.props.innerHTML = `
      <div class="field">
        <label>Nom</label>
        <input id="p_name" value="${escapeAttr(node.name)}" />
      </div>

      <div class="field">
        <label>Description</label>
        <textarea id="p_desc">${escapeHtml(node.description || "")}</textarea>
      </div>

      <div class="hr"></div>
      <div class="field">
        <label>Séries (config par série)</label>
        <div class="sets" id="sets"></div>
        <div class="row gap">
          <button class="btn btn-ghost" id="btnAddHold">+ Série Hold</button>
          <button class="btn btn-ghost" id="btnAddReps">+ Série Reps</button>
        </div>
        <div class="mini">Reps: capSec=0 ⇒ pas de timer de reps, validation manuelle.</div>
      </div>
    `;

    this.el.props.querySelector("#p_name").addEventListener("input", (e) => {
      node.name = e.target.value;
      this.currentWorkout.updatedAt = new Date().toISOString();
      this.renderTree();
    });
    this.el.props.querySelector("#p_desc").addEventListener("input", (e) => {
      node.description = e.target.value;
      this.currentWorkout.updatedAt = new Date().toISOString();
    });

    const setsEl = this.el.props.querySelector("#sets");
    const renderSets = () => {
      setsEl.innerHTML = "";
      sets.forEach((s, i) => {
        const row = document.createElement("div");
        row.className = "setrow";

        const kind = s.work?.kind || "hold";
        const kindSel = document.createElement("select");
        kindSel.innerHTML = `
          <option value="hold" ${
            kind === "hold" ? "selected" : ""
          }>Hold</option>
          <option value="reps" ${
            kind === "reps" ? "selected" : ""
          }>Reps</option>
        `;

        const v1 = document.createElement("input");
        v1.type = "number";
        v1.min = "0";
        v1.step = "1";
        const v2 = document.createElement("input");
        v2.type = "number";
        v2.min = "0";
        v2.step = "1";
        const rest = document.createElement("input");
        rest.type = "number";
        rest.min = "0";
        rest.step = "5";

        if (kind === "hold") {
          v1.value = Number(s.work?.seconds || 0);
          v2.value = 0;
          v2.disabled = true;
        } else {
          v1.value = Number(s.work?.reps || 0);
          v2.value = Number(s.work?.capSec || 0);
          v2.disabled = false;
        }
        rest.value = Number(s.restSec || 0);

        const del = document.createElement("button");
        del.className = "del";
        del.textContent = "×";
        del.title = "Supprimer la série";

        kindSel.addEventListener("change", () => {
          if (kindSel.value === "hold") {
            s.work = { kind: "hold", seconds: clampInt(v1.value, 0, 9999) };
            v2.disabled = true;
            v2.value = 0;
          } else {
            s.work = {
              kind: "reps",
              reps: clampInt(v1.value, 0, 9999),
              capSec: clampInt(v2.value, 0, 9999),
            };
            v2.disabled = false;
          }
          this.currentWorkout.updatedAt = new Date().toISOString();
          renderSets();
          this.renderTree();
        });

        v1.addEventListener("input", () => {
          if (s.work.kind === "hold")
            s.work.seconds = clampInt(v1.value, 0, 9999);
          else s.work.reps = clampInt(v1.value, 0, 9999);
          this.currentWorkout.updatedAt = new Date().toISOString();
          this.renderTree();
        });

        v2.addEventListener("input", () => {
          if (s.work.kind === "reps")
            s.work.capSec = clampInt(v2.value, 0, 9999);
          this.currentWorkout.updatedAt = new Date().toISOString();
        });

        rest.addEventListener("input", () => {
          s.restSec = clampInt(rest.value, 0, 99999);
          this.currentWorkout.updatedAt = new Date().toISOString();
        });

        del.addEventListener("click", () => {
          sets.splice(i, 1);
          if (sets.length === 0) {
            sets.push(defaultSetHold(10, 60));
          }
          node.sets = sets;
          this.currentWorkout.updatedAt = new Date().toISOString();
          renderSets();
          this.renderTree();
        });

        row.append(kindSel, v1, v2, rest, del);
        setsEl.appendChild(row);
      });
    };

    renderSets();

    this.el.props.querySelector("#btnAddHold").addEventListener("click", () => {
      sets.push(defaultSetHold(10, 90));
      node.sets = sets;
      this.currentWorkout.updatedAt = new Date().toISOString();
      renderSets();
      this.renderTree();
    });

    this.el.props.querySelector("#btnAddReps").addEventListener("click", () => {
      sets.push(defaultSetReps(10, 90, 0));
      node.sets = sets;
      this.currentWorkout.updatedAt = new Date().toISOString();
      renderSets();
      this.renderTree();
    });
  }

  // -------------------------
  // RUNNER
  // -------------------------
  async startRunner() {
    if (!this.currentWorkout) return;

    this.steps = flattenWorkout(this.currentWorkout);
    this.stepIndex = 0;
    this.emomRoundStartAt.clear();

    this.el.runTitle.textContent = this.currentWorkout.title;
    this.el.runSub.textContent = `${this.steps.length} étape(s)`;
    this.renderQueue();

    this.globalTimer?.stop?.();
    this.globalTimer = new IntervalTimer((ms) => {
      this.el.globalTime.textContent = fmtTime(ms / 1000);
    });
    this.globalTimer.reset();
    this.globalTimer.start();

    await requestWakeLock();

    this.stepMode = "idle";
    this.autoRun = false; // autoRun démarre quand tu lances la 1ère étape
    this.isPaused = false;

    this.renderStep();
  }

  renderQueue() {
    const list = this.el.queueList;
    list.innerHTML = "";
    const max = 12;
    for (
      let i = this.stepIndex;
      i < Math.min(this.steps.length, this.stepIndex + max);
      i++
    ) {
      const s = this.steps[i];
      const item = document.createElement("div");
      item.className = "queue-item";
      item.innerHTML = `
        <div class="t">${escapeHtml(s.title)}</div>
        <div class="s">${escapeHtml((s.path || []).join(" › "))}</div>
      `;
      list.appendChild(item);
    }
  }

  renderStep() {
    const s = this.steps[this.stepIndex];
    if (this.el.btnPrevStep) this.el.btnPrevStep.disabled = this.stepIndex <= 0;
    if (!s) {
      tripleBeep();
      this.el.stepBadge.textContent = "TERMINÉ";
      this.el.stepTitle.textContent = "Séance terminée";
      this.el.stepDesc.hidden = true;
      this.el.primaryLabel.textContent = "—";
      this.el.primaryTime.textContent = "00:00";
      this.el.progressText.textContent = `${this.steps.length} / ${this.steps.length}`;
      this.el.hint.textContent = "Fin.";
      this.el.btnStartStep.disabled = true;
      this.el.btnRestartStep.disabled = true;
      this.el.btnSkipStep.disabled = true;
      return;
    }

    this.el.btnStartStep.disabled = false;
    this.el.btnRestartStep.disabled = false;
    this.el.btnSkipStep.disabled = false;

    this.el.stepTitle.textContent = s.title;
    const p = (s.path || []).join(" › ");
    this.el.stepBadge.textContent = s.type.replaceAll("_", " ").toUpperCase();
    this.el.progressText.textContent = `${this.stepIndex + 1} / ${
      this.steps.length
    }`;

    if (s.type === "exercise_set") {
      const setLabel = `Série ${s.setIndex + 1}/${s.setCount}`;
      const w = s.work || { kind: "reps", reps: 10, capSec: 0 };
      this.el.primaryLabel.textContent = `${setLabel} — ${
        w.kind === "hold" ? `${w.seconds}s hold` : `${w.reps} reps`
      }`;
    } else if (s.type === "rest" || s.type === "block_rest") {
      this.el.primaryLabel.textContent = `Repos — ${s.seconds}s`;
    } else if (s.type === "emom_round_start") {
      this.el.primaryLabel.textContent = `Round ${s.round}/${s.rounds} — interval ${s.intervalSec}s`;
    } else if (s.type === "emom_round_end_wait") {
      this.el.primaryLabel.textContent = `Attente fin interval ${s.intervalSec}s`;
    } else {
      this.el.primaryLabel.textContent = "Étape";
    }

    this.el.stepDesc.textContent = s.description || "";
    this.el.stepDesc.hidden = true;

    this.el.primaryTime.textContent = "00:00";
    this.el.hint.textContent = p
      ? `Chemin: ${p}`
      : "Décompte 5s avant lancement du timer.";
    this.el.btnStartStep.textContent = "Démarrer";

    this.maybeAutoStart();
    this.renderQueue();
  }

  toggleDesc() {
    const s = this.steps[this.stepIndex];
    if (!s || !s.description) return;
    this.el.stepDesc.hidden = !this.el.stepDesc.hidden;
  }

  startCurrentStep(fromAuto = false) {
    const s = this.steps[this.stepIndex];
    if (!s) return;

    // 1) Si l’utilisateur clique pendant qu’un timer tourne => PAUSE
    if (this.stepMode === "work" || this.stepMode === "countdown") {
      // pause volontaire
      this.isPaused = true;
      this.autoRun = true; // garde l’autoRun, mais en pause
      this.clearStepRuntime();
      this.el.btnStartStep.textContent = "Reprendre";
      this.el.hint.textContent = "Pause. Clique Reprendre pour continuer.";
      return;
    }

    // 2) Si on est en pause et qu’il clique => RESUME + auto
    if (this.isPaused && !fromAuto) {
      this.isPaused = false;
      this.autoRun = true;
      this.el.btnStartStep.textContent = "Pause";
      this.maybeAutoStart();
      return;
    }

    // 3) Premier démarrage manuel => autoRun ON
    if (!fromAuto) {
      this.autoRun = true;
      this.isPaused = false;
      this.el.btnStartStep.textContent = "Pause";
    }

    if (s.type === "emom_round_start") {
      this.emomRoundStartAt.set(this.stepIndex, performance.now());
      beep(520, 100, 0.07);
      this.nextStep();
      return;
    }

    if (s.type === "emom_round_end_wait") {
      const startIdx = s.dependsOnRoundStartIndex;
      const t0 = this.emomRoundStartAt.get(startIdx);
      if (!t0) {
        this.nextStep();
        return;
      }
      const elapsed = (performance.now() - t0) / 1000;
      const remaining = Math.max(0, Math.ceil(s.intervalSec - elapsed));
      if (remaining <= 0) {
        tripleBeep();
        this.nextStep();
        return;
      }
      this.runCountdownThenTimer(remaining, {
        label: "Attente",
        autoAdvance: true,
        noPrep: true,
      });
      return;
    }

    if (s.type === "rest" || s.type === "block_rest") {
      this.runCountdownThenTimer(Number(s.seconds || 0), {
        label: "Repos",
        autoAdvance: true,
        noPrep: true,
      });
      return;
    }

    if (s.type === "exercise_set") {
      const w = s.work || { kind: "reps", reps: 10, capSec: 0 };

      if (w.kind === "hold") {
        this.runCountdownThenTimer(Number(w.seconds || 0), {
          label: "Hold",
          autoAdvance: true,
        });
        return;
      }

      const cap = Number(w.capSec || 0);
      if (cap > 0) {
        this.runCountdownThenTimer(cap, {
          label: "Reps (cap)",
          autoAdvance: true,
        });
        return;
      }

      // reps sans cap
      this.runPrepCountdown(5, () => {
        tripleBeep();
        this.el.primaryTime.textContent = "GO";
        this.el.primaryLabel.textContent = `Reps — ${w.reps} (valide quand fini)`;
        this.el.btnStartStep.textContent = "Série faite";
        this.el.hint.textContent =
          "Clique “Série faite” quand terminé (le repos arrive après).";
        const handler = () => {
          this.el.btnStartStep.removeEventListener("click", handler);
          this.el.btnStartStep.textContent = "Pause";
          beep(880, 90, 0.07);
          this.nextStep();
          this.maybeAutoStart();
        };

        this.el.btnStartStep.addEventListener("click", handler, { once: true });
      });
      return;
    }

    this.nextStep();
  }

  runPrepCountdown(sec, onDone) {
    this.clearStepRuntime();
    this.stepMode = "countdown";
    let last = sec;
    this.el.primaryLabel.textContent = "Décompte";
    this.el.primaryTime.textContent = fmtTime(sec);
    beep(440, 80, 0.05);

    this.stepCountdown = new Countdown(
      sec,
      (rem) => {
        this.el.primaryTime.textContent = fmtTime(rem);
        if (rem !== last) {
          last = rem;
          if (rem <= 3 && rem > 0) beep(660, 70, 0.06);
        }
      },
      () => {
        onDone?.();
      }
    );

    this.stepCountdown.start();
  }

  runCountdownThenTimer(durationSec, opts) {
    const { label, autoAdvance, noPrep } = opts || {};
    if (durationSec <= 0) {
      if (autoAdvance) {
        this.nextStep();
        // nextStep() appelle renderStep() qui appelle maybeAutoStart()
      }

      return;
    }

    const startTimer = () => {
      this.clearStepRuntime();
      this.stepMode = "work";
      this.el.primaryLabel.textContent = label || "Timer";
      let remaining = durationSec;
      this.el.primaryTime.textContent = fmtTime(remaining);
      tripleBeep();

      const id = setInterval(() => {
        remaining -= 1;
        this.el.primaryTime.textContent = fmtTime(remaining);
        if (remaining === 3) beep(660, 70, 0.06);
        if (remaining <= 0) {
          clearInterval(id);
          tripleBeep();
          if (autoAdvance) this.nextStep();
        }
      }, 1000);

      this._stepIntervalId = id;
    };

    if (noPrep) startTimer();
    else this.runPrepCountdown(5, startTimer);
  }

  restartCurrentStep() {
    this.clearStepRuntime();
    this.el.btnStartStep.textContent = "Démarrer";
    this.renderStep();
  }

  skipStep() {
    this.clearStepRuntime();
    this.el.btnStartStep.textContent = "Démarrer";
    this.nextStep();
  }

  prevStep() {
    this.clearStepRuntime();
    this.el.btnStartStep.textContent = "Démarrer";
    this.stepIndex = Math.max(0, this.stepIndex - 1);
    this.renderStep();
    this.maybeAutoStart(); // si autoRun actif, repart sur une étape "timée"
  }
  
  maybeAutoStart() {
    if (!this.autoRun) return;
    if (this.isPaused) return;

    const s = this.steps[this.stepIndex];
    if (!s) return;

    // BLOQUANT: reps sans cap => manuel
    if (s.type === "exercise_set") {
      const w = s.work || { kind: "reps", reps: 10, capSec: 0 };
      if (w.kind === "reps" && Number(w.capSec || 0) <= 0) {
        return;
      }
    }

    setTimeout(() => this.startCurrentStep(true), 80);
  }

  nextStep() {
    this.clearStepRuntime();
    this.el.btnStartStep.textContent = "Démarrer";
    this.stepIndex = Math.min(this.steps.length, this.stepIndex + 1);
    this.renderStep();
  }

  clearStepRuntime() {
    if (this.stepCountdown) {
      this.stepCountdown.stop();
      this.stepCountdown = null;
    }
    if (this._stepIntervalId) {
      clearInterval(this._stepIntervalId);
      this._stepIntervalId = null;
    }
    this.stepMode = "idle";
  }

  async stopRunner(goSilent = false) {
    this.clearStepRuntime();
    this.globalTimer?.stop?.();
    this.globalTimer = null;
    await releaseWakeLock();
    if (!goSilent) this.el.globalTime.textContent = "00:00";
  }

  async stopAndReturn() {
    await this.stopRunner(true);
    this.goLibrary();
  }

  // -------------------------
  // OVERLAY API (in-app confirm/form)
  // -------------------------
  openConfirm({
    title,
    message,
    confirmText = "OK",
    cancelText = "Annuler",
    danger = false,
  }) {
    const body = document.createElement("div");
    const p = document.createElement("div");
    p.className = "ov-note";
    p.textContent = message || "";
    body.appendChild(p);

    return this.openOverlay({
      title,
      body,
      actions: [
        { text: cancelText, kind: "ghost", value: false },
        { text: confirmText, kind: danger ? "danger" : "primary", value: true },
      ],
    });
  }

  openForm({
    title,
    note = "",
    fields = [],
    confirmText = "OK",
    cancelText = "Annuler",
  }) {
    const body = document.createElement("div");
    if (note) {
      const n = document.createElement("div");
      n.className = "ov-note";
      n.textContent = note;
      n.style.marginBottom = "12px";
      body.appendChild(n);
    }

    const inputs = new Map();

    for (const f of fields) {
      const wrap = document.createElement("div");
      wrap.className = "ov-field";

      const label = document.createElement("label");
      label.textContent = f.label || f.key;

      let input;
      if (f.type === "textarea") {
        input = document.createElement("textarea");
        input.value = String(f.value ?? "");
      } else if (f.type === "select") {
        input = document.createElement("select");
        for (const opt of f.options || []) {
          const o = document.createElement("option");
          o.value = String(opt.value);
          o.textContent = String(opt.label);
          if (String(opt.value) === String(f.value)) o.selected = true;
          input.appendChild(o);
        }
      } else {
        input = document.createElement("input");
        input.type = f.type || "text";
        input.value = String(f.value ?? "");
      }
      if (f.required) input.setAttribute("data-required", "1");

      wrap.append(label, input);
      body.appendChild(wrap);
      inputs.set(f.key, input);
    }

    return this.openOverlay({
      title,
      body,
      actions: [
        { text: cancelText, kind: "ghost", value: null },
        {
          text: confirmText,
          kind: "primary",
          value: () => {
            // validate required
            for (const [k, el] of inputs.entries()) {
              if (el.getAttribute("data-required") === "1") {
                const v = (el.value || "").trim();
                if (!v) {
                  el.focus();
                  this.toast("Champ requis", `Remplis: ${k}`, { danger: true });
                  return null;
                }
              }
            }
            const out = {};
            for (const [k, el] of inputs.entries()) {
              out[k] = el.value;
            }
            return out;
          },
        },
      ],
      focusFirstInput: true,
    });
  }

  openOverlay({ title, body, actions = [], focusFirstInput = false }) {
    this.el.ovTitle.textContent = title || "Validation";
    this.el.ovBody.innerHTML = "";
    this.el.ovActions.innerHTML = "";
    this.el.ovBody.appendChild(body);

    this.el.overlay.hidden = false;

    return new Promise((resolve) => {
      this._overlayResolve = resolve;

      const makeBtn = (a) => {
        const b = document.createElement("button");
        b.className = "btn";
        if (a.kind === "ghost") b.className = "btn btn-ghost";
        if (a.kind === "danger") b.className = "btn btn-danger";
        b.textContent = a.text;
        b.addEventListener("click", () => {
          let v = a.value;
          if (typeof v === "function") v = v();
          // si validator renvoie null => on ne ferme pas
          if (typeof a.value === "function" && v === null) return;
          this.closeOverlay(v);
        });
        return b;
      };

      for (const a of actions) {
        this.el.ovActions.appendChild(makeBtn(a));
      }

      if (focusFirstInput) {
        const first = this.el.ovBody.querySelector(
          "input,textarea,select,button"
        );
        first?.focus?.();
      }
    });
  }

  closeOverlay(value) {
    if (this.el.overlay.hidden) return;
    this.el.overlay.hidden = true;
    const res = this._overlayResolve;
    this._overlayResolve = null;
    res?.(value);
  }

  // -------------------------
  // TOASTS
  // -------------------------
  toast(title, subtitle = "", opts = {}) {
    const id = ++this._toastId;
    const t = document.createElement("div");
    t.className = "toast";
    if (opts.danger) {
      t.style.borderColor = "rgba(255,59,92,.6)";
    }
    t.innerHTML = `
      <div>
        <div class="t">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="s">${escapeHtml(subtitle)}</div>` : ``}
      </div>
      <button class="x" title="Fermer">✕</button>
    `;
    const btn = t.querySelector(".x");
    btn.addEventListener("click", () => t.remove());
    this.el.toastHost.appendChild(t);

    const ttl = opts.ttlMs ?? 2600;
    window.setTimeout(() => {
      if (t.isConnected) t.remove();
    }, ttl);

    return id;
  }
}

// helpers
function clampInt(v, min, max) {
  const n = Math.floor(Number(v || 0));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll("\n", " ");
}
