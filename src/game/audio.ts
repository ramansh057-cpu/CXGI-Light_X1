/**
 * Web Audio Synthesizer for BGMI Sound Effects
 * High fidelity, low CPU footprint, 0 external download delay.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  private init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  public resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  // Gunshots
  public playGunshot(type: 'm416' | 'akm' | 'awm' | 'kar98k' | 's12k' | 'pan', isEnemy = false, distance = 0) {
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const distGain = Math.max(0.04, 1 - Math.min(1, distance / 350));
    const enemyDamping = isEnemy ? 0.7 : 1.0;
    const finalVolume = distGain * enemyDamping;

    if (type === 'pan') {
      // Resonant metal clang
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(840, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.35);

      gain.gain.setValueAtTime(0.5 * finalVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.36);
      return;
    }

    // Noise buffer for gunshot explosion crack
    const bufferSize = this.ctx.sampleRate * (type === 'awm' ? 0.8 : type === 'akm' ? 0.45 : 0.3);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const noiseGain = this.ctx.createGain();

    // Bass punch oscillator
    const punchOsc = this.ctx.createOscillator();
    const punchGain = this.ctx.createGain();

    if (type === 'awm') {
      // Massive magnum sniper rifle thunder
      filter.frequency.setValueAtTime(2600, t);
      filter.frequency.exponentialRampToValueAtTime(400, t + 0.6);

      noiseGain.gain.setValueAtTime(0.9 * finalVolume, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

      punchOsc.type = 'sawtooth';
      punchOsc.frequency.setValueAtTime(150, t);
      punchOsc.frequency.exponentialRampToValueAtTime(30, t + 0.4);

      punchGain.gain.setValueAtTime(0.8 * finalVolume, t);
      punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    } else if (type === 'akm') {
      // Punchy 7.62 assault rifle
      filter.frequency.setValueAtTime(3200, t);
      filter.frequency.exponentialRampToValueAtTime(600, t + 0.4);

      noiseGain.gain.setValueAtTime(0.7 * finalVolume, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      punchOsc.type = 'triangle';
      punchOsc.frequency.setValueAtTime(180, t);
      punchOsc.frequency.exponentialRampToValueAtTime(45, t + 0.25);

      punchGain.gain.setValueAtTime(0.6 * finalVolume, t);
      punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    } else if (type === 's12k') {
      // Shotgun blast
      filter.frequency.setValueAtTime(1800, t);
      filter.frequency.exponentialRampToValueAtTime(350, t + 0.35);

      noiseGain.gain.setValueAtTime(0.85 * finalVolume, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      punchOsc.type = 'sine';
      punchOsc.frequency.setValueAtTime(120, t);
      punchOsc.frequency.exponentialRampToValueAtTime(35, t + 0.2);

      punchGain.gain.setValueAtTime(0.7 * finalVolume, t);
      punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    } else {
      // M416 / Kar98k assault rifle / bolt rifle
      filter.frequency.setValueAtTime(4000, t);
      filter.frequency.exponentialRampToValueAtTime(800, t + 0.25);

      noiseGain.gain.setValueAtTime(0.65 * finalVolume, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      punchOsc.type = 'sine';
      punchOsc.frequency.setValueAtTime(220, t);
      punchOsc.frequency.exponentialRampToValueAtTime(60, t + 0.15);

      punchGain.gain.setValueAtTime(0.5 * finalVolume, t);
      punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    }

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    punchOsc.connect(punchGain);
    punchGain.connect(this.masterGain);

    whiteNoise.start(t);
    punchOsc.start(t);

    whiteNoise.stop(t + 0.8);
    punchOsc.stop(t + 0.5);
  }

  // Hitmarker sound
  public playHitmarker(isHeadshot: boolean) {
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (isHeadshot) {
      // High-pitched metallic "DINK!"
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1900, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.12);

      gain.gain.setValueAtTime(0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    } else {
      // Tactical body hit "tick"
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, t);
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.08);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // Bullet impact on terrain / rock / metal
  public playImpact(type: 'dirt' | 'metal' | 'flesh') {
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (type === 'metal') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1600, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  // Footsteps
  public playFootstep(surface: 'grass' | 'road' | 'water' = 'grass') {
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (surface === 'road') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.06);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    } else {
      // Grass / dirt soft crunch
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140 + Math.random() * 30, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.07);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Reload sound
  public playReload() {
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    // Step 1: Magazine unclick
    this.playClick(t, 600, 0.1);
    // Step 2: Magazine insert (0.7s later)
    this.playClick(t + 0.7, 750, 0.12);
    // Step 3: Bolt cock (1.4s later)
    this.playClick(t + 1.4, 920, 0.15);
  }

  private playClick(time: number, freq: number, dur: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, time + dur);
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // Parachute deploy sound
  public playParachute() {
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.6;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + 0.62);
  }

  // Bluezone warning siren
  public playZoneWarning() {
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.4);
    osc.frequency.linearRampToValueAtTime(440, t + 0.8);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 1.25);
  }

  // Vehicle Horn
  public playHorn() {
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(410, t);
    osc2.frequency.setValueAtTime(490, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.setValueAtTime(0.3, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.42);
    osc2.stop(t + 0.42);
  }

  // Vehicle Engine loop
  public updateEngineSound(active: boolean, speedNorm: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    if (!active) {
      if (this.engineGain) {
        this.engineGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        setTimeout(() => {
          if (this.engineOsc) {
            try { this.engineOsc.stop(); } catch { /* ignore */ }
            this.engineOsc = null;
            this.engineGain = null;
          }
        }, 220);
      }
      return;
    }

    if (!this.engineOsc && this.masterGain) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.setValueAtTime(0.001, t);
      this.engineGain.gain.linearRampToValueAtTime(0.18, t + 0.2);
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);
      this.engineOsc.start(t);
    }

    if (this.engineOsc && this.engineGain) {
      const baseFreq = 50 + speedNorm * 110;
      this.engineOsc.frequency.setTargetAtTime(baseFreq, t, 0.08);
      const targetGain = 0.12 + speedNorm * 0.16;
      this.engineGain.gain.setTargetAtTime(targetGain, t, 0.08);
    }
  }

  // Healing / Revive sound
  public playMedkit() {
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.35);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.42);
  }

  // Jump sound
  public playJump() {
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.1);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // Supply Drop Airplane flyby hum
  public playPlaneFlyby() {
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.linearRampToValueAtTime(95, t + 2.5);
    osc.frequency.linearRampToValueAtTime(75, t + 5.0);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 2.5);
    gain.gain.linearRampToValueAtTime(0.001, t + 5.0);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 5.1);
  }

  // Victory fanfare
  public playVictoryFanfare() {
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C major arpeggio
    notes.forEach((freq, idx) => {
      const time = this.ctx!.currentTime + idx * 0.12;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(time);
      osc.stop(time + 0.65);
    });
  }
}

export const sound = new SoundEngine();
