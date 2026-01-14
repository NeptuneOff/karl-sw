// Transforme l'arbre en timeline linéaire d'étapes (work/rest/blockRest, + EMOM rounds)
export function flattenWorkout(workout){
  const steps = [];
  const root = workout.root;

  function walkBlock(block, pathTitles = []){
    const path = [...pathTitles, block.title].filter(Boolean);

    if(block.kind === "emom"){
      const intervalSec = Math.max(10, Number(block.emom?.intervalSec || 60));
      const rounds = Math.max(1, Number(block.emom?.rounds || 10));
      // EMOM = rounds, chaque round: exos séquentiels, puis attente jusqu'à fin d'interval
      for(let r=1; r<=rounds; r++){
        const roundStartIdx = steps.length;
        steps.push({
          type: "emom_round_start",
          title: `EMOM ${block.title} — Round ${r}/${rounds}`,
          path,
          intervalSec,
          round: r,
          rounds
        });

        // dans un round, pour chaque exo, on exécute "1 set" (le set[0]) par design
        // Si tu veux plus, tu dupliques l'exo dans le bloc EMOM.
        for(const node of block.nodes || []){
          if(node.type === "exercise"){
            const set = node.sets?.[0];
            steps.push({
              type: "exercise_set",
              title: node.name,
              description: node.description || "",
              path,
              exerciseId: node.id,
              setIndex: 0,
              setCount: 1,
              work: set?.work || { kind:"reps", reps: 10, capSec: 0 },
              restSec: 0,
              emom: { intervalSec, round: r, rounds }
            });
          }else if(node.type === "block"){
            // bloc dans EMOM : on déroule, mais ça casse la simplicité; on l'autorise quand même.
            walkBlock(node, path);
          }
        }

        steps.push({
          type: "emom_round_end_wait",
          title: `Attente fin de minute — Round ${r}/${rounds}`,
          path,
          intervalSec,
          // runner va calculer dynamiquement le temps restant de l'interval
          round: r,
          rounds,
          dependsOnRoundStartIndex: roundStartIdx
        });
      }

      if((block.restEndSec || 0) > 0){
        steps.push({
          type: "block_rest",
          title: `Repos fin de bloc — ${block.title}`,
          path,
          seconds: block.restEndSec
        });
      }
      return;
    }

    // Normal block
    for(const node of block.nodes || []){
      if(node.type === "block"){
        walkBlock(node, path);
      }else if(node.type === "exercise"){
        const sets = Array.isArray(node.sets) ? node.sets : [];
        const setCount = Math.max(1, sets.length || 1);
        for(let i=0; i<setCount; i++){
          const s = sets[i] || sets[sets.length-1] || { work:{kind:"reps", reps:10, capSec:0}, restSec: 60 };
          steps.push({
            type: "exercise_set",
            title: node.name,
            description: node.description || "",
            path,
            exerciseId: node.id,
            setIndex: i,
            setCount,
            work: s.work,
            restSec: Number(s.restSec || 0)
          });
          if(Number(s.restSec || 0) > 0){
            steps.push({
              type: "rest",
              title: `Repos`,
              path,
              seconds: Number(s.restSec || 0),
              forExercise: node.name,
              setIndex: i,
              setCount
            });
          }
        }
      }
    }

    if((block.restEndSec || 0) > 0){
      steps.push({
        type: "block_rest",
        title: `Repos fin de bloc — ${block.title}`,
        path,
        seconds: block.restEndSec
      });
    }
  }

  walkBlock(root, []);
  return steps;
}
