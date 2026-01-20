class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.dataArray = null;
    this.isActive = false;
  }

  async initialize() {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect microphone to analyser
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);

      // Setup data array for frequency data
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      this.isActive = true;
      return { success: true };
    } catch (error) {
      console.error('Error initializing audio:', error);
      return { success: false, error: error.message };
    }
  }

  getDecibels() {
    if (!this.isActive || !this.analyser) {
      return 0;
    }

    // Get frequency data
    this.analyser.getByteFrequencyData(this.dataArray);

    // Calculate RMS (Root Mean Square)
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = this.dataArray[i] / 255.0;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);

    // Convert to decibels with calibration offset
    // Note: Web Audio API provides relative values, not calibrated SPL
    // Offset adjusted so quiet room (~0.01 RMS) reads ~30-40 dB
    const db = 20 * Math.log10(rms + 0.0001) + 90;

    // Clamp between 0 and 120
    return Math.max(0, Math.min(120, db));
  }

  stop() {
    if (this.microphone) {
      this.microphone.disconnect();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.isActive = false;
  }
}

export default AudioProcessor;
