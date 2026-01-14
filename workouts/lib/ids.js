export function uid(){
  if(globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // fallback
  return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}
