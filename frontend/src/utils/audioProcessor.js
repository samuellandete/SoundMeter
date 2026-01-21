class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.dataArray = null;
    this.isActive = false;
    // Reference level for dB calculation
    // Typical quiet room has RMS ~0.001-0.003, representing ~30-40 dB SPL
    this.referenceRms = 0.00002; // Approximates 0 dB SPL reference
  }

  async initialize() {
    try {
      // Check for secure context (HTTPS or localhost)
      if (!window.isSecureContext) {
        throw new Error(
          'Microphone access requires HTTPS. ' +
          'Please access this site via HTTPS or localhost.'
        );
      }

      // Check for mediaDevices API availability
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Microphone API not available. ' +
          'This may be due to browser restrictions on non-HTTPS sites. ' +
          'Please use HTTPS or access from localhost.'
        );
      }

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
      // Set to 0 for instant response - no smoothing/averaging
      // This gives real-time values that respond immediately to sound changes
      this.analyser.smoothingTimeConstant = 0;

      // Connect microphone to analyser
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);

      // Setup data array for time domain data (waveform amplitude)
      // Use Float32Array for precise amplitude values (-1 to 1)
      const bufferLength = this.analyser.fftSize;
      this.dataArray = new Float32Array(bufferLength);

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

    // Get time domain data (raw waveform amplitude, values from -1 to 1)
    // This gives us the actual sound pressure wave, not frequency spectrum
    this.analyser.getFloatTimeDomainData(this.dataArray);

    // Calculate RMS (Root Mean Square) of the amplitude
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i] * this.dataArray[i];
    }
    const rms = Math.sqrt(sum / this.dataArray.length);

    // Handle silence (avoid log of zero)
    if (rms < 0.00001) {
      return 0;
    }

    // Convert to decibels using standard formula: dB = 20 * log10(rms / reference)
    // Using a reference that maps typical microphone input to realistic SPL values:
    // - Web Audio API full scale is 1.0
    // - Typical quiet room (~40 dB SPL) produces RMS ~0.001-0.003
    // - Loud speech (~70 dB SPL) produces RMS ~0.01-0.05
    // Reference is tuned so these map to realistic dB values
    const db = 20 * Math.log10(rms / this.referenceRms);

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
