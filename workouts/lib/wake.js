let lock = null;

export async function requestWakeLock(){
  try{
    if(!("wakeLock" in navigator)) return false;
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => { lock = null; });
    return true;
  }catch{
    return false;
  }
}

export async function releaseWakeLock(){
  try{
    if(lock){
      await lock.release();
      lock = null;
    }
  }catch{
    // ignore
  }
}
