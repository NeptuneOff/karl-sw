import { uid } from "./ids.js";

export function createWorkout(title){
  return {
    id: uid(),
    type: "workout",
    title: title?.trim() || "Séance",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    root: createBlock("Séance", { restEndSec: 0, kind: "block" })
  };
}

export function createBlock(title, opts = {}){
  return {
    id: uid(),
    type: "block",
    kind: opts.kind || "block", // "block" | "emom"
    title: title?.trim() || "Bloc",
    restEndSec: Number.isFinite(opts.restEndSec) ? opts.restEndSec : 0,
    // EMOM config (ignored if kind !== "emom")
    emom: opts.kind === "emom" ? {
      intervalSec: 60,
      rounds: 10
    } : null,
    nodes: []
  };
}

// Exercise with per-set config (reps/hold can vary per set)
export function createExercise(name){
  return {
    id: uid(),
    type: "exercise",
    name: name?.trim() || "Exercice",
    description: "",
    sets: [
      defaultSetHold(10, 90),
      defaultSetHold(10, 90)
    ]
  };
}

export function defaultSetHold(seconds = 10, restSec = 90){
  return { work: { kind: "hold", seconds }, restSec };
}

export function defaultSetReps(reps = 10, restSec = 90, capSec = 0){
  // capSec=0 => pas de timer de reps, validation manuelle
  return { work: { kind: "reps", reps, capSec }, restSec };
}

export function seedDemo(){
  const w = createWorkout("Démo Planche / Front");

  const b1 = createBlock("Bloc Planche", { restEndSec: 120, kind:"block" });
  const ex1 = createExercise("Tuck planche");
  ex1.description = "Position de planche jambes rentrées";
  ex1.sets = [
    defaultSetHold(10, 90),
    defaultSetHold(10, 90),
  ];

  const ex2 = createExercise("Planche leans");
  ex2.description = "Bascule épaules, scap protraction, bras tendus";
  ex2.sets = [
    defaultSetHold(20, 60),
    defaultSetHold(20, 60),
    defaultSetHold(20, 60),
  ];

  b1.nodes.push(ex1, ex2);

  const emom = createBlock("EMOM - Scap + Core", { kind:"emom", restEndSec: 180 });
  emom.emom.intervalSec = 60;
  emom.emom.rounds = 8;

  const ex3 = createExercise("Scap pull-ups");
  ex3.sets = [ defaultSetReps(12, 0, 0) ]; // 1 set par round (logique EMOM)
  const ex4 = createExercise("Hollow hold");
  ex4.sets = [ defaultSetHold(25, 0) ];

  emom.nodes.push(ex3, ex4);

  w.root.nodes.push(b1, emom);
  w.updatedAt = new Date().toISOString();
  return w;
}

export function validateWorkout(workout){
  const issues = [];
  if(!workout || workout.type !== "workout") issues.push("type workout attendu");
  if(!workout.title) issues.push("title manquant");
  if(!workout.root || workout.root.type !== "block") issues.push("root bloc manquant");
  // shallow checks
  return issues;
}
