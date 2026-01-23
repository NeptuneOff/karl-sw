export const CATALOG = [
  {
    id: "tuck_planche",
    name: "Tuck planche",
    description: "Position de planche jambes rentrées. Scapula protractées, bassin en rétroversion.",
    defaultKind: "hold",
    defaultSets: [
      { kind:"hold", seconds: 10, rest: 60 },
      { kind:"hold", seconds: 10, rest: 60 }
    ]
  },
  {
    id: "front_lever_tuck",
    name: "Front lever tuck",
    description: "Tuck strict. Dépression + rétraction contrôlées. Bassin verrouillé.",
    defaultKind: "hold",
    defaultSets: [
      { kind:"hold", seconds: 10, rest: 60 },
      { kind:"hold", seconds: 10, rest: 60 }
    ]
  },
  {
    id: "pullups_weighted",
    name: "Tractions lestées",
    description: "Amplitude complète, gainage, tempo contrôlé.",
    defaultKind: "reps",
    defaultSets: [
      { kind:"reps", reps: 5, capSec: 0, rest: 180 },
      { kind:"reps", reps: 5, capSec: 0, rest: 180 },
      { kind:"reps", reps: 5, capSec: 0, rest: 180 }
    ]
  },
  {
    id: "dips_weighted",
    name: "Dips lestés",
    description: "Épaules basses, coudes proches, amplitude complète.",
    defaultKind: "reps",
    defaultSets: [
      { kind:"reps", reps: 6, capSec: 0, rest: 180 },
      { kind:"reps", reps: 6, capSec: 0, rest: 180 },
      { kind:"reps", reps: 6, capSec: 0, rest: 180 }
    ]
  }
];
