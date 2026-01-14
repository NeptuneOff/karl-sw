const MUTE_KEY = "site:muted";
let muted = false;

export function initAudioPreferences(){
  muted = localStorage.getItem(MUTE_KEY) === "1";
  return muted;
}

export function isMuted(){
  return muted;
}

export function setMuted(value){
  muted = !!value;
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

export function toggleMuted(){
  setMuted(!muted);
  return muted;
}

export function beep(freq=440, ms=100, gain=0.06){
  if(muted) return;

  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();

    setTimeout(() => {
      try{ o.stop(); }catch{}
      try{ ctx.close(); }catch{}
    }, ms);
  }catch{
    // silence
  }
}

export function tripleBeep(){
  if(muted) return;
  beep(700, 90, 0.07);
  setTimeout(() => beep(880, 90, 0.07), 140);
  setTimeout(() => beep(1050, 110, 0.07), 290);
}
