class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.frequencyData = null;
    this.isActive = false;
    // Pre-computed per-bin correction tables (A-weighting + iPad mic compensation)
    this.binCorrections = null;
  }

  // IEC 61672:2003 A-weighting at frequency f (Hz)
  // Returns correction in dB relative to 1kHz
  static aWeight(f) {
    if (f <= 0) return -Infinity;
    const f2 = f * f;
    const numerator = 12194 * 12194 * f2 * f2;
    const denominator =
      (f2 + 20.6 * 20.6) *
      Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
      (f2 + 12194 * 12194);
    const ra = numerator / denominator;
    // A(f) referenced to A(1000 Hz)
    const ra1000 = AudioProcessor.aWeight1000;
    return 20 * Math.log10(ra) - 20 * Math.log10(ra1000);
  }

  // iPad MEMS microphone compensation (approximate inverse of typical response)
  // iPad mics are relatively flat 200Hz-6kHz, roll off at extremes,
  // and have a resonance peak around 6-8kHz
  static ipadMicCompensation(f) {
    if (f <= 0) return 0;
    let correction = 0;

    // Low-frequency roll-off compensation: boost below 200Hz
    if (f < 200) {
      // ~+3dB/octave below 200Hz to compensate for mic roll-off
      correction += 3 * Math.log2(200 / f);
    }

    // High-frequency resonance compensation: attenuate 6-8kHz peak
    // Model as a gentle notch centered at 7kHz
    const peakCenter = 7000;
    const peakWidth = 2000;
    const peakAttenuation = -4; // dB to counteract ~+4dB mic resonance
    const distFromPeak = Math.abs(f - peakCenter);
    if (distFromPeak < peakWidth) {
      correction += peakAttenuation * (1 - distFromPeak / peakWidth);
    }

    // High-frequency roll-off compensation: boost above 10kHz
    if (f > 10000) {
      // ~+6dB/octave above 10kHz to compensate for mic roll-off
      correction += 6 * Math.log2(f / 10000);
    }

    return correction;
  }

  // Pre-compute per-bin corrections (A-weighting + iPad mic)
  _buildCorrectionTable() {
    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.analyser.frequencyBinCount; // fftSize / 2
    this.binCorrections = new Float32Array(binCount);

    for (let i = 0; i < binCount; i++) {
      const freq = i * sampleRate / this.analyser.fftSize;
      if (freq < 20 || freq > 20000) {
        // Outside audible range — suppress entirely
        this.binCorrections[i] = -Infinity;
      } else {
        this.binCorrections[i] =
          AudioProcessor.aWeight(freq) + AudioProcessor.ipadMicCompensation(freq);
      }
    }
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
      // Set to 0 for instant response — no temporal smoothing
      this.analyser.smoothingTimeConstant = 0;

      // Connect microphone to analyser
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);

      // Setup frequency-domain data buffer (fftSize/2 bins)
      this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);

      // Pre-compute A-weighting + iPad mic correction per frequency bin
      this._buildCorrectionTable();

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

    // Get frequency-domain data (dB per bin, relative to full scale)
    this.analyser.getFloatFrequencyData(this.frequencyData);

    // Sum energy across all bins with A-weighting + iPad mic corrections
    let totalPower = 0;
    for (let i = 0; i < this.frequencyData.length; i++) {
      const correction = this.binCorrections[i];
      if (correction === -Infinity) continue;

      // frequencyData[i] is in dBFS; apply correction
      const correctedDb = this.frequencyData[i] + correction;

      // Convert dB to linear power and accumulate
      totalPower += Math.pow(10, correctedDb / 10);
    }

    // Handle silence
    if (totalPower < 1e-15) {
      return 0;
    }

    // Convert total power back to dB (still dBFS at this point)
    const dbfs = 10 * Math.log10(totalPower);

    // Map dBFS to approximate dB SPL
    // Web Audio dBFS 0 = digital full scale ≈ ~90-94 dB SPL for typical iPad mic
    // Offset calibrated so that -50 dBFS ≈ 40 dB SPL (quiet room)
    const dbSpl = dbfs + 94;

    // Clamp between 0 and 120
    return Math.max(0, Math.min(120, dbSpl));
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

// Pre-compute Ra(1000) constant for A-weighting reference
// Ra(1000) using the same formula with f=1000
(() => {
  const f = 1000;
  const f2 = f * f;
  const numerator = 12194 * 12194 * f2 * f2;
  const denominator =
    (f2 + 20.6 * 20.6) *
    Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
    (f2 + 12194 * 12194);
  AudioProcessor.aWeight1000 = numerator / denominator;
})();

export default AudioProcessor;
