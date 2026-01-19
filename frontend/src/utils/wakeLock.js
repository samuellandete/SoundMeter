let wakeLock = null;

export const requestWakeLock = async () => {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock active');

      wakeLock.addEventListener('release', () => {
        console.log('Wake Lock released');
      });

      return true;
    } catch (err) {
      console.error('Wake Lock error:', err);
      return false;
    }
  }
  return false;
};

export const releaseWakeLock = async () => {
  if (wakeLock !== null) {
    await wakeLock.release();
    wakeLock = null;
  }
};
