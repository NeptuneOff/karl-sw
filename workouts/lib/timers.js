export function fmtTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
}

export class IntervalTimer{
  constructor(onTick){
    this.onTick = onTick;
    this.running = false;
    this._raf = null;
    this._last = 0;
    this.elapsedMs = 0;
  }

  start(){
    if(this.running) return;
    this.running = true;
    this._last = performance.now();
    const loop = (t) => {
      if(!this.running) return;
      const dt = t - this._last;
      this._last = t;
      this.elapsedMs += dt;
      this.onTick?.(this.elapsedMs);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop(){
    this.running = false;
    if(this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  reset(){
    this.elapsedMs = 0;
    this._last = performance.now();
    this.onTick?.(this.elapsedMs);
  }
}

export class Countdown{
  constructor(durationSec, onTick, onDone){
    this.durationSec = durationSec;
    this.remaining = durationSec;
    this.onTick = onTick;
    this.onDone = onDone;
    this._id = null;
    this.running = false;
  }

  start(){
    if(this.running) return;
    this.running = true;
    this.remaining = this.durationSec;
    this.onTick?.(this.remaining);

    this._id = setInterval(() => {
      this.remaining -= 1;
      this.onTick?.(this.remaining);
      if(this.remaining <= 0){
        this.stop();
        this.onDone?.();
      }
    }, 1000);
  }

  stop(){
    this.running = false;
    if(this._id) clearInterval(this._id);
    this._id = null;
  }
}
