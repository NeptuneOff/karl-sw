const KEY = "karl.workouts.v1";

export class Storage{
  loadAll(){
    const raw = localStorage.getItem(KEY);
    if(!raw) return [];
    try{
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return parsed;
      return [];
    }catch{
      return [];
    }
  }

  saveAll(list){
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  upsert(workout){
    const list = this.loadAll();
    const idx = list.findIndex(w => w.id === workout.id);
    if(idx >= 0) list[idx] = workout;
    else list.unshift(workout);
    this.saveAll(list);
  }

  remove(id){
    const list = this.loadAll().filter(w => w.id !== id);
    this.saveAll(list);
  }

  exportAll(){
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      workouts: this.loadAll()
    }, null, 2);
  }

  importAll(payload){
    if(!payload || typeof payload !== "object") throw new Error("Bad payload");
    const workouts = payload.workouts;
    if(!Array.isArray(workouts)) throw new Error("Missing workouts");
    // merge by id
    const existing = this.loadAll();
    const map = new Map(existing.map(w => [w.id, w]));
    for(const w of workouts){
      if(w && w.id) map.set(w.id, w);
    }
    this.saveAll(Array.from(map.values()));
  }
}
