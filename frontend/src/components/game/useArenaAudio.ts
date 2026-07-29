import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent } from '../../types/api';
import { soundForEvent, type ArenaSound } from './gameDirector';

class ArenaAudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private ambientNodes: AudioScheduledSourceNode[] = [];
  private volume = 0.42;
  private wantsAmbient = false;

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    if (this.wantsAmbient) this.startAmbient();
  }

  isReady() {
    return this.context?.state === 'running';
  }

  setVolume(value: number) {
    this.volume = value;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.03);
    }
  }

  setAmbient(active: boolean) {
    this.wantsAmbient = active;
    if (!active) this.stopAmbient();
    else if (this.isReady()) this.startAmbient();
  }

  play(sound: ArenaSound) {
    if (!this.context || !this.master || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const tone = (
      from: number,
      to: number,
      duration: number,
      gain: number,
      offset = 0,
      type: OscillatorType = 'sine',
    ) => this.tone(from, to, duration, gain, now + offset, type);

    if (sound === 'speech') tone(390, 330, 0.06, 0.025, 0, 'triangle');
    if (sound === 'vote') {
      tone(150, 92, 0.07, 0.075, 0, 'triangle');
      this.noise(0.035, 0.035, 1500, now);
    }
    if (sound === 'gavel') {
      [0, 0.15].forEach((offset) => {
        tone(115, 62, 0.12, 0.13, offset, 'triangle');
        this.noise(0.045, 0.08, 850, now + offset);
      });
    }
    if (sound === 'tie') {
      tone(220, 220, 0.42, 0.045, 0, 'sine');
      tone(277, 246, 0.42, 0.045, 0.08, 'sine');
    }
    if (sound === 'night') {
      tone(130, 48, 0.9, 0.07, 0, 'sine');
      this.noise(0.8, 0.018, 260, now);
    }
    if (sound === 'day') {
      tone(330, 440, 0.42, 0.04, 0, 'sine');
      tone(440, 660, 0.48, 0.035, 0.12, 'sine');
    }
    if (sound === 'seer') {
      [0, 0.09, 0.18, 0.3].forEach((offset, index) => (
        tone(420 + index * 95, 520 + index * 110, 0.42, 0.028, offset, 'sine')
      ));
    }
    if (sound === 'potion') {
      tone(190, 720, 0.7, 0.045, 0, 'sine');
      this.noise(0.4, 0.012, 2400, now + 0.1);
    }
    if (sound === 'shield') {
      tone(160, 118, 0.5, 0.07, 0, 'triangle');
      tone(480, 360, 0.32, 0.025, 0.03, 'sine');
    }
    if (sound === 'sheriff') {
      [0, 0.16, 0.32].forEach((offset, index) => (
        tone(392 + index * 100, 392 + index * 100, 0.5, 0.035, offset, 'sine')
      ));
    }
    if (sound === 'death') {
      tone(95, 38, 0.72, 0.12, 0, 'sine');
      this.noise(0.16, 0.055, 420, now);
    }
    if (sound === 'wolf') {
      // 利刃锁定：中高频金属摩擦下行 + 低吼尾音。
      // 故意避开夜晚 ambient 的低频段（<210Hz），确保能被听见。
      tone(680, 240, 0.28, 0.07, 0, 'sawtooth');
      tone(520, 180, 0.34, 0.045, 0.04, 'triangle');
      this.noise(0.22, 0.03, 3200, now + 0.02);
      tone(140, 70, 0.5, 0.05, 0.12, 'sine');
    }
    if (sound === 'gunshot') {
      this.noise(0.32, 0.22, 1800, now);
      tone(82, 32, 0.62, 0.15, 0, 'square');
    }
    if (sound === 'explosion') {
      this.noise(0.8, 0.25, 720, now);
      tone(70, 25, 0.9, 0.17, 0, 'sawtooth');
    }
    if (sound === 'victory-good') {
      [262, 330, 392, 523].forEach((frequency, index) => (
        tone(frequency, frequency * 1.01, 0.8, 0.04, index * 0.13, 'sine')
      ));
    }
    if (sound === 'victory-wolf') {
      [147, 131, 98].forEach((frequency, index) => (
        tone(frequency, frequency * 0.78, 0.9, 0.06, index * 0.16, 'sawtooth')
      ));
    }
  }

  private tone(
    from: number,
    to: number,
    duration: number,
    level: number,
    start: number,
    type: OscillatorType,
  ) {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(duration: number, level: number, frequency: number, start: number) {
    if (!this.context || !this.master) return;
    const buffer = this.context.createBuffer(
      1,
      Math.ceil(this.context.sampleRate * duration),
      this.context.sampleRate,
    );
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start);
  }

  private startAmbient() {
    if (!this.context || !this.master || this.ambientNodes.length) return;
    const sampleCount = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let drift = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      drift = (drift + (Math.random() * 2 - 1) * 0.02) * 0.985;
      channel[index] = drift;
    }
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const noiseGain = this.context.createGain();
    noise.buffer = buffer;
    noise.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 210;
    noiseGain.gain.value = 0.025;
    noise.connect(filter).connect(noiseGain).connect(this.master);

    const hum = this.context.createOscillator();
    const humGain = this.context.createGain();
    hum.type = 'sine';
    hum.frequency.value = 48;
    humGain.gain.value = 0.009;
    hum.connect(humGain).connect(this.master);
    noise.start();
    hum.start();
    this.ambientNodes = [noise, hum];
  }

  private stopAmbient() {
    this.ambientNodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // 已经停止的音源无需重复处理。
      }
    });
    this.ambientNodes = [];
  }
}

const engine = new ArenaAudioEngine();

function savedVolume() {
  const value = Number(localStorage.getItem('ai-arena:volume') || 0.42);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.42;
}

export function useArenaAudio(events: GameEvent[], phase: string | undefined, active: boolean) {
  const cursor = useRef<number | null>(null);
  const [enabled, setEnabledState] = useState(
    () => localStorage.getItem('ai-arena:sound') !== '0',
  );
  const [volume, setVolumeState] = useState(savedVolume);
  const [ready, setReady] = useState(engine.isReady());

  useEffect(() => {
    engine.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    engine.setAmbient(enabled && active && phase === 'night');
    return () => engine.setAmbient(false);
  }, [active, enabled, phase]);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      engine.unlock().then(() => setReady(engine.isReady())).catch(() => setReady(false));
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [enabled]);

  useEffect(() => {
    if (cursor.current === null || events.length < cursor.current) {
      cursor.current = events.length;
      return;
    }
    const added = events.slice(cursor.current);
    cursor.current = events.length;
    if (!enabled || !active || !added.length) return;
    const timers = added
      .map(soundForEvent)
      .filter((sound): sound is ArenaSound => Boolean(sound))
      .map((sound, index) => window.setTimeout(() => engine.play(sound), index * 110));
    return () => timers.forEach(window.clearTimeout);
  }, [active, enabled, events]);

  const setEnabled = useCallback((next: boolean) => {
    localStorage.setItem('ai-arena:sound', next ? '1' : '0');
    setEnabledState(next);
    if (!next) engine.setAmbient(false);
    else engine.unlock().then(() => setReady(engine.isReady())).catch(() => setReady(false));
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    localStorage.setItem('ai-arena:volume', String(clamped));
    setVolumeState(clamped);
  }, []);

  return { enabled, ready, volume, setEnabled, setVolume };
}
