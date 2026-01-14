let ctx = null;

function ensureCtx(){
  if(ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export function beep(freq=880, ms=90, gain=0.06){
  const c = ensureCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(c.destination);
  o.start();
  setTimeout(() => {
    o.stop();
    o.disconnect();
    g.disconnect();
  }, ms);
}

export function tripleBeep(){
  beep(880, 70); setTimeout(() => beep(880, 70), 120); setTimeout(() => beep(880, 70), 240);
}
