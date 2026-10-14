(() => {
  'use strict';

  // --- Guitar Constants & Tunings (6th string E2 -> 1st string E4) ---
  const STRINGS = [
    { index: 0, label: '6E', baseMidi: 40, gauge: 4.2, color: '#d4a359', damping: 0.9945 },
    { index: 1, label: '5A', baseMidi: 45, gauge: 3.5, color: '#d8ad68', damping: 0.9952 },
    { index: 2, label: '4D', baseMidi: 50, gauge: 2.9, color: '#dec089', damping: 0.9958 },
    { index: 3, label: '3G', baseMidi: 55, gauge: 2.3, color: '#d6d9de', damping: 0.9964 },
    { index: 4, label: '2B', baseMidi: 59, gauge: 1.8, color: '#e2e5ea', damping: 0.9968 },
    { index: 5, label: '1E', baseMidi: 64, gauge: 1.4, color: '#f1f3f6', damping: 0.9972 },
  ];

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NUM_FRETS = 5;

  // Voicings: array of 6 values [6E, 5A, 4D, 3G, 2B, 1E], -1 = muted (X), 0 = open, 1..5 = fret
  const CHORD_LIBRARY = [
    { id: 'C',     name: 'C',     sub: 'C · E · G',      frets: [-1, 3, 2, 0, 1, 0] },
    { id: 'G',     name: 'G',     sub: 'G · B · D',      frets: [ 3, 2, 0, 0, 0, 3] },
    { id: 'Am',    name: 'Am',    sub: 'A · C · E',      frets: [-1, 0, 2, 2, 1, 0] },
    { id: 'F',     name: 'F',     sub: 'F · A · C',      frets: [ 1, 3, 3, 2, 1, 1] },
    { id: 'Em',    name: 'Em',    sub: 'E · G · B',      frets: [ 0, 2, 2, 0, 0, 0] },
    { id: 'D',     name: 'D',     sub: 'D · F♯ · A',     frets: [-1,-1, 0, 2, 3, 2] },
    { id: 'Dm',    name: 'Dm',    sub: 'D · F · A',      frets: [-1,-1, 0, 2, 3, 1] },
    { id: 'E7',    name: 'E7',    sub: 'E · G♯ · B · D', frets: [ 0, 2, 0, 1, 0, 0] },
    { id: 'A',     name: 'A',     sub: 'A · C♯ · E',     frets: [-1, 0, 2, 2, 2, 0] },
    { id: 'G7',    name: 'G7',    sub: 'G · B · D · F',  frets: [ 3, 2, 0, 0, 0, 1] },
    { id: 'Cadd9', name: 'Cadd9', sub: 'C · D · E · G',  frets: [-1, 3, 2, 0, 3, 3] },
    { id: 'Bm',    name: 'Bm',    sub: 'B · D · F♯',     frets: [-1, 2, 4, 4, 3, 2] },
  ];

  const CHORD_MAP = Object.fromEntries(CHORD_LIBRARY.map((c) => [c.id, c]));

  // --- Application State ---
  const state = {
    mode: 'fretboard', // 'fretboard' | 'chord'
    tone: 'acoustic',  // 'acoustic' | 'clean' | 'drive'
    capo: 0,
    volume: 85,
    isMuted: false,
    holdMode: false,
    leftHanded: false,
    guideChordId: '',
    selectedChordId: 'C',
    tapStrumInChordMode: false,

    // Latched frets per string (used when holdMode is true, or when a chord is selected in Chord mode)
    latchedFrets: [0, 0, 0, 0, 0, 0],
    // Muted state toggled via the Nut bar in Fretboard Mode
    nutMuted: [false, false, false, false, false, false],
    // Live multi-touch pointers on the fretboard: Map<pointerId, { stringIdx, fret }>
    fretPointers: new Map(),

    // Visual string vibration state for Canvas rendering
    vibrations: STRINGS.map(() => ({
      amplitude: 0,
      phase: 0,
      freq: 110,
      lastPluckTime: 0,
    })),
    // Trail points in strum zone for visual feedback
    strumTrails: [],
  };

  // --- Web Audio API Karplus-Strong Guitar Synthesizer ---
  class GuitarSynth {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.toneInput = null;
      this.activeVoices = new Array(6).fill(null);
    }

    getEffectiveGain() {
      if (state.isMuted) return 0;
      return Math.max(0, Math.min(1, state.volume / 100));
    }

    updateMasterGain() {
      if (!this.ctx || !this.masterGain) return;
      const target = this.getEffectiveGain();
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.getEffectiveGain();
        this.masterGain.connect(this.ctx.destination);
        this.rebuildToneChain();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    rebuildToneChain() {
      if (!this.ctx) return;
      if (this.toneInput) {
        try {
          this.toneInput.disconnect();
        } catch (_) {}
      }

      const ctx = this.ctx;
      const input = ctx.createGain();
      this.toneInput = input;

      if (state.tone === 'acoustic') {
        // Acoustic wooden body resonance (105Hz air cavity + 235Hz top plate + warm presence)
        const bodyLow = ctx.createBiquadFilter();
        bodyLow.type = 'peaking';
        bodyLow.frequency.value = 108;
        bodyLow.Q.value = 2.2;
        bodyLow.gain.value = 5.5;

        const bodyMid = ctx.createBiquadFilter();
        bodyMid.type = 'peaking';
        bodyMid.frequency.value = 240;
        bodyMid.Q.value = 1.8;
        bodyMid.gain.value = 3.5;

        const airHigh = ctx.createBiquadFilter();
        airHigh.type = 'highshelf';
        airHigh.frequency.value = 3200;
        airHigh.gain.value = 2.0;

        input.connect(bodyLow);
        bodyLow.connect(bodyMid);
        bodyMid.connect(airHigh);
        airHigh.connect(this.masterGain);
      } else if (state.tone === 'clean') {
        // Electric Clean: glassy mid scoop + subtle slapback ambience
        const midScoop = ctx.createBiquadFilter();
        midScoop.type = 'peaking';
        midScoop.frequency.value = 650;
        midScoop.Q.value = 1.2;
        midScoop.gain.value = -3.5;

        const chime = ctx.createBiquadFilter();
        chime.type = 'peaking';
        chime.frequency.value = 2400;
        chime.Q.value = 1.4;
        chime.gain.value = 4.5;

        const delay = ctx.createDelay(0.2);
        delay.delayTime.value = 0.065;
        const wetGain = ctx.createGain();
        wetGain.gain.value = 0.22;

        input.connect(midScoop);
        midScoop.connect(chime);
        chime.connect(this.masterGain);
        chime.connect(delay);
        delay.connect(wetGain);
        wetGain.connect(this.masterGain);
      } else if (state.tone === 'drive') {
        // Overdrive: tube soft-clipping waveshaper + speaker cabinet filter
        const preGain = ctx.createGain();
        preGain.gain.value = 3.2;

        const shaper = ctx.createWaveShaper();
        shaper.curve = this.makeDistortionCurve(18);
        shaper.oversample = '2x';

        const cabFilter = ctx.createBiquadFilter();
        cabFilter.type = 'lowpass';
        cabFilter.frequency.value = 3600;
        cabFilter.Q.value = 0.9;

        const postGain = ctx.createGain();
        postGain.gain.value = 0.55;

        input.connect(preGain);
        preGain.connect(shaper);
        shaper.connect(cabFilter);
        cabFilter.connect(postGain);
        postGain.connect(this.masterGain);
      }
    }

    makeDistortionCurve(amount) {
      const samples = 44100;
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.tanh(x * (1 + amount * 0.25));
      }
      return curve;
    }

    stopStringVoice(stringIdx, stopTime) {
      const prev = this.activeVoices[stringIdx];
      if (!prev || !this.ctx) return;
      const now = Math.max(this.ctx.currentTime, stopTime || this.ctx.currentTime);
      try {
        prev.gainNode.gain.cancelScheduledValues(now);
        prev.gainNode.gain.setValueAtTime(prev.gainNode.gain.value, now);
        prev.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.028);
        prev.source.stop(now + 0.032);
      } catch (_) {}
      this.activeVoices[stringIdx] = null;
    }

    pluckString(stringIdx, fret, velocity = 0.85, timeOffset = 0, direction = 'down') {
      this.ensureContext();
      const ctx = this.ctx;
      const startTime = ctx.currentTime + Math.max(0, timeOffset);

      // Stop previous ringing note on the same string
      this.stopStringVoice(stringIdx, startTime);

      if (fret < 0) {
        // Muted string percussive scratch ("チャッ")
        this.playMutedScratch(stringIdx, velocity * 0.45, startTime);
        return;
      }

      const strInfo = STRINGS[stringIdx];
      const midi = strInfo.baseMidi + state.capo + fret;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);

      const sampleRate = ctx.sampleRate;
      const duration = state.tone === 'drive' ? 3.0 : 2.5;
      const totalSamples = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
      const data = buffer.getChannelData(0);

      // Karplus-Strong delay line synthesis with pick position & brightness control
      const period = Math.max(8, Math.round(sampleRate / freq));
      const delayLine = new Float32Array(period);

      // Pick position comb filtering (simulates plucking near soundhole vs bridge)
      const pickPos = direction === 'up' ? 0.16 : 0.22;
      const pickOffset = Math.max(1, Math.floor(period * pickPos));
      const rawNoise = new Float32Array(period);

      for (let i = 0; i < period; i++) {
        rawNoise[i] = Math.random() * 2 - 1;
      }

      // Smooth initial noise burst based on velocity (softer pluck = warmer initial wave)
      const smoothPasses = velocity > 0.8 ? 1 : 2;
      for (let p = 0; p < smoothPasses; p++) {
        let prev = rawNoise[period - 1];
        for (let i = 0; i < period; i++) {
          const curr = rawNoise[i];
          rawNoise[i] = 0.55 * curr + 0.45 * prev;
          prev = curr;
        }
      }

      for (let i = 0; i < period; i++) {
        const delayedIdx = (i - pickOffset + period) % period;
        delayLine[i] = (rawNoise[i] - 0.65 * rawNoise[delayedIdx]) * velocity;
      }

      // Higher frets decay slightly faster than open strings
      const fretDampingPenalty = fret * 0.00025;
      const baseDamping = Math.min(0.9985, strInfo.damping - fretDampingPenalty + (state.tone === 'drive' ? 0.0012 : 0));
      // Blend factor controls low-pass brightness inside the loop
      const brightness = Math.min(0.82, 0.52 + velocity * 0.25 + stringIdx * 0.03);

      let ptr = 0;
      let prevSample = 0;
      for (let i = 0; i < totalSamples; i++) {
        const current = delayLine[ptr];
        const nextPtr = (ptr + 1) % period;
        const next = delayLine[nextPtr];

        // Two-point weighted lowpass average for warm string decay
        const filtered = (brightness * current + (1 - brightness) * next) * baseDamping;
        delayLine[ptr] = filtered;
        ptr = nextPtr;

        // Subtle DC block / body warmth smoothing
        data[i] = current * 0.75 + prevSample * 0.25;
        prevSample = current;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0.42, startTime);
      voiceGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.02);

      source.connect(voiceGain);
      voiceGain.connect(this.toneInput);

      source.start(startTime);
      source.stop(startTime + duration);

      this.activeVoices[stringIdx] = { source, gainNode: voiceGain, fret };
    }

    playMutedScratch(stringIdx, gainAmount, startTime) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * 0.045);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const out = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 2.2);
        out[i] = (Math.random() * 2 - 1) * env * gainAmount;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 320 + stringIdx * 95;
      bp.Q.value = 2.5;

      const g = ctx.createGain();
      g.gain.value = 0.5;

      src.connect(bp);
      bp.connect(g);
      g.connect(this.toneInput);
      src.start(startTime);
    }
  }

  const synth = new GuitarSynth();

  // --- DOM Elements ---
  const modeFretboardBtn = document.getElementById('mode-fretboard-btn');
  const modeChordBtn = document.getElementById('mode-chord-btn');
  const fretboardView = document.getElementById('fretboard-view');
  const chordView = document.getElementById('chord-view');
  const toneSelect = document.getElementById('tone-select');
  const capoSelect = document.getElementById('capo-select');
  const holdToggleBtn = document.getElementById('hold-toggle-btn');
  const holdStateText = document.getElementById('hold-state-text');
  const activeChordBadge = document.getElementById('active-chord-badge');
  const guideChipsContainer = document.getElementById('guide-chips');
  const clearFretsBtn = document.getElementById('clear-frets-btn');
  const nutRow = document.getElementById('nut-row');
  const fretboardSurface = document.getElementById('fretboard-surface');
  const chordGrid = document.getElementById('chord-grid');
  const chordTapStrumCheckbox = document.getElementById('chord-tap-strum');
  const strumDownBtn = document.getElementById('strum-down-btn');
  const strumUpBtn = document.getElementById('strum-up-btn');
  const strumZone = document.getElementById('strum-zone');
  const stringCanvas = document.getElementById('string-canvas');
  const strumColumns = document.getElementById('strum-columns');

  // --- Helper: Compute effective fret for each of the 6 strings ---
  function getEffectiveFrets() {
    if (state.mode === 'chord') {
      const chord = CHORD_MAP[state.selectedChordId];
      return chord ? [...chord.frets] : [0, 0, 0, 0, 0, 0];
    }

    // Fretboard mode: combine nut mute, latched frets, and live multi-touch pointers
    const result = new Array(6).fill(0);
    for (let s = 0; s < 6; s++) {
      if (state.nutMuted[s]) {
        result[s] = -1;
      } else {
        result[s] = state.latchedFrets[s];
      }
    }

    // Live multi-touch fingers override (highest fret on same string wins, just like a real guitar)
    const liveMax = new Array(6).fill(0);
    for (const pos of state.fretPointers.values()) {
      if (pos.stringIdx >= 0 && pos.stringIdx < 6 && pos.fret > liveMax[pos.stringIdx]) {
        liveMax[pos.stringIdx] = pos.fret;
      }
    }
    for (let s = 0; s < 6; s++) {
      if (liveMax[s] > 0) {
        result[s] = Math.max(result[s], liveMax[s]);
      }
    }
    return result;
  }

  function getNoteNameForString(stringIdx, fret) {
    if (fret < 0) return '✕';
    const midi = STRINGS[stringIdx].baseMidi + state.capo + fret;
    const name = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave}`;
  }

  // Detect if current frets match a known chord
  function detectChordName(frets) {
    for (const chord of CHORD_LIBRARY) {
      let match = true;
      for (let s = 0; s < 6; s++) {
        if (chord.frets[s] !== frets[s]) {
          match = false;
          break;
        }
      }
      if (match) return chord.name;
    }
    if (frets.every((f) => f === 0)) return 'Open';
    if (frets.every((f) => f === -1)) return 'Mute';
    return 'Custom';
  }

  // --- Build DOM for Nut Row, Fretboard Grid, Chord Pads, and Bridge Pins ---
  const nutCells = [];
  const fretCells = Array.from({ length: 6 }, () => new Array(NUM_FRETS + 1));
  const bridgePins = [];
  const chordPadButtons = new Map();

  function buildUI() {
    // 1. Nut Row (6 strings)
    nutRow.innerHTML = '';
    for (let s = 0; s < 6; s++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nut-cell';
      btn.dataset.string = String(s);
      btn.setAttribute('aria-label', `Toggle open or mute for string ${STRINGS[s].label}`);
      btn.innerHTML = `
        <span class="nut-string-name">${STRINGS[s].label}</span>
        <span class="nut-status">0</span>
      `;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        // Tapping nut cell: if string has a latched fret, reset it to Open (0); otherwise toggle Open(0) <-> Mute(X)
        if (state.latchedFrets[s] > 0) {
          state.latchedFrets[s] = 0;
          state.nutMuted[s] = false;
        } else {
          state.nutMuted[s] = !state.nutMuted[s];
        }
        updateFretboardVisuals();
      });
      nutRow.appendChild(btn);
      nutCells.push(btn);
    }

    // 2. Fretboard Surface (5 rows = frets 1..5, 6 cols = strings 0..5)
    // Keep existing inlays
    const existingInlays = Array.from(fretboardSurface.querySelectorAll('.fret-inlay'));
    fretboardSurface.innerHTML = '';
    existingInlays.forEach((el) => fretboardSurface.appendChild(el));

    for (let f = 1; f <= NUM_FRETS; f++) {
      for (let s = 0; s < 6; s++) {
        const cell = document.createElement('div');
        cell.className = 'fret-cell';
        cell.dataset.string = String(s);
        cell.dataset.fret = String(f);
        cell.style.setProperty('--string-width', `${STRINGS[s].gauge}px`);
        cell.style.setProperty('--string-color', STRINGS[s].color);

        const marker = document.createElement('div');
        marker.className = 'fret-marker';
        marker.textContent = getNoteNameForString(s, f).replace(/\d+$/, '');
        cell.appendChild(marker);

        fretboardSurface.appendChild(cell);
        fretCells[s][f] = cell;
      }
    }

    // 3. Chord Mode Grid
    chordGrid.innerHTML = '';
    for (const chord of CHORD_LIBRARY) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chord-pad';
      btn.dataset.chord = chord.id;
      const voicingText = chord.frets.map((f) => (f < 0 ? 'x' : f)).join(' ');
      btn.innerHTML = `
        <span class="chord-pad-name">${chord.name}</span>
        <span class="chord-pad-sub">${chord.sub}</span>
        <span class="chord-pad-voicing">${voicingText}</span>
      `;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        selectChord(chord.id, state.tapStrumInChordMode);
      });
      chordGrid.appendChild(btn);
      chordPadButtons.set(chord.id, btn);
    }

    // 4. Bridge Pins in Strum Zone
    strumColumns.innerHTML = '';
    for (let s = 0; s < 6; s++) {
      const pin = document.createElement('div');
      pin.className = 'bridge-pin';
      pin.innerHTML = `<span class="bridge-note-badge" id="bridge-badge-${s}">E2</span>`;
      strumColumns.appendChild(pin);
      bridgePins.push(pin);
    }
  }

  // --- Update Visuals for Frets, Nut, Chord Pads, and Bridge Badges ---
  function updateFretboardVisuals() {
    const effectiveFrets = getEffectiveFrets();
    const guideChord = state.guideChordId ? CHORD_MAP[state.guideChordId] : null;

    for (let s = 0; s < 6; s++) {
      const eff = effectiveFrets[s];
      const nutCell = nutCells[s];
      const statusEl = nutCell.querySelector('.nut-status');

      nutCell.classList.toggle('is-muted', eff < 0);
      nutCell.classList.toggle('is-fretted', eff > 0);
      statusEl.textContent = eff < 0 ? '✕' : `${eff}F`;

      for (let f = 1; f <= NUM_FRETS; f++) {
        const cell = fretCells[s][f];
        const marker = cell.querySelector('.fret-marker');
        const isPressed = eff === f;
        const isGuide = Boolean(guideChord && guideChord.frets[s] === f);

        cell.classList.toggle('is-pressed', isPressed);
        cell.classList.toggle('is-guide', isGuide && !isPressed);
        marker.textContent = getNoteNameForString(s, f).replace(/\d+$/, '');
      }

      // Bridge pin readout
      const pin = bridgePins[s];
      const badge = pin.querySelector('.bridge-note-badge');
      pin.classList.toggle('is-muted', eff < 0);
      badge.textContent = getNoteNameForString(s, eff);
    }

    // Update active chord badge in header
    const detected = state.mode === 'chord' ? state.selectedChordId : detectChordName(effectiveFrets);
    activeChordBadge.textContent = detected;

    // Highlight active chord pad and update voicing order for lefty mode
    for (const [id, btn] of chordPadButtons.entries()) {
      btn.classList.toggle('active', id === state.selectedChordId);
      const chord = CHORD_MAP[id];
      const voicingEl = btn.querySelector('.chord-pad-voicing');
      if (chord && voicingEl) {
        const frets = state.leftHanded ? [...chord.frets].reverse() : chord.frets;
        voicingEl.textContent = frets.map((f) => (f < 0 ? 'x' : f)).join(' ');
      }
    }
  }

  // --- Select a Chord (updates both Chord Mode & Fretboard latched positions) ---
  function selectChord(chordId, shouldPreviewStrum = false) {
    const chord = CHORD_MAP[chordId];
    if (!chord) return;
    state.selectedChordId = chordId;

    // Sync chord shape into Fretboard latched state so switching modes preserves the shape
    for (let s = 0; s < 6; s++) {
      if (chord.frets[s] < 0) {
        state.nutMuted[s] = true;
        state.latchedFrets[s] = 0;
      } else {
        state.nutMuted[s] = false;
        state.latchedFrets[s] = chord.frets[s];
      }
    }

    updateFretboardVisuals();

    if (shouldPreviewStrum) {
      triggerFullStrum('down', 0.72);
    }
  }

  // --- Fretboard Multi-Touch / Pointer Handling ---
  function getFretCellFromPoint(clientX, clientY) {
    const rect = fretboardSurface.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    const col = Math.min(5, Math.max(0, Math.floor(relX * 6)));
    const stringIdx = state.leftHanded ? 5 - col : col;
    const fret = Math.min(NUM_FRETS, Math.max(1, Math.floor(relY * NUM_FRETS) + 1));
    return { stringIdx, fret };
  }

  fretboardSurface.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    synth.ensureContext();
    try {
      fretboardSurface.setPointerCapture(e.pointerId);
    } catch (_) {}

    const hit = getFretCellFromPoint(e.clientX, e.clientY);
    if (!hit) return;

    // Clear nut mute if user presses a fret on that string
    state.nutMuted[hit.stringIdx] = false;

    if (state.holdMode) {
      // Toggle latched fret on this string
      if (state.latchedFrets[hit.stringIdx] === hit.fret) {
        state.latchedFrets[hit.stringIdx] = 0;
      } else {
        state.latchedFrets[hit.stringIdx] = hit.fret;
      }
    } else {
      state.fretPointers.set(e.pointerId, hit);
    }

    updateFretboardVisuals();
  });

  fretboardSurface.addEventListener('pointermove', (e) => {
    if (state.holdMode || !state.fretPointers.has(e.pointerId)) return;
    const hit = getFretCellFromPoint(e.clientX, e.clientY);
    if (!hit) return;

    const prev = state.fretPointers.get(e.pointerId);
    if (!prev || prev.stringIdx !== hit.stringIdx || prev.fret !== hit.fret) {
      state.nutMuted[hit.stringIdx] = false;
      state.fretPointers.set(e.pointerId, hit);
      updateFretboardVisuals();
    }
  });

  function releaseFretPointer(e) {
    if (state.fretPointers.has(e.pointerId)) {
      state.fretPointers.delete(e.pointerId);
      updateFretboardVisuals();
    }
  }

  fretboardSurface.addEventListener('pointerup', releaseFretPointer);
  fretboardSurface.addEventListener('pointercancel', releaseFretPointer);
  fretboardSurface.addEventListener('lostpointercapture', releaseFretPointer);

  // --- Strumming & Picking Interaction (Lower Stage) ---
  const strumPointers = new Map();

  function getStringLayout() {
    const canvasRect = stringCanvas.getBoundingClientRect();
    const colsRect = strumColumns.getBoundingClientRect();
    const offsetLeft = colsRect.left - canvasRect.left;
    const colWidth = colsRect.width / 6;
    const xs = STRINGS.map((_, s) => {
      const col = state.leftHanded ? 5 - s : s;
      return offsetLeft + colWidth * (col + 0.5);
    });
    return { xs, colWidth };
  }

  function triggerStringPluck(stringIdx, velocity = 0.85, timeOffset = 0, direction = 'down') {
    const effectiveFrets = getEffectiveFrets();
    const fret = effectiveFrets[stringIdx];
    synth.pluckString(stringIdx, fret, velocity, timeOffset, direction);

    // Trigger visual vibration & bridge badge pulse
    const vib = state.vibrations[stringIdx];
    vib.amplitude = fret < 0 ? 3.5 : Math.min(15, 6 + velocity * 9);
    vib.phase = 0;
    vib.lastPluckTime = performance.now();

    const pin = bridgePins[stringIdx];
    if (pin) {
      pin.classList.add('plucked');
      setTimeout(() => pin.classList.remove('plucked'), 140);
    }
  }

  function triggerFullStrum(direction = 'down', velocity = 0.82) {
    synth.ensureContext();
    const order = direction === 'down' ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
    const stepDelay = 0.022; // 22ms arpeggiated roll per string
    order.forEach((stringIdx, idx) => {
      // Slight human velocity curve across strings
      const strVel = Math.min(1, velocity * (0.9 + idx * 0.025));
      triggerStringPluck(stringIdx, strVel, idx * stepDelay, direction);
    });
  }

  strumZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    synth.ensureContext();
    try {
      strumZone.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = stringCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { xs: stringXs, colWidth } = getStringLayout();

    // Check if pointer landed directly near a string for immediate single-string pluck
    let tappedString = -1;
    for (let s = 0; s < 6; s++) {
      if (Math.abs(x - stringXs[s]) <= colWidth * 0.42) {
        tappedString = s;
        break;
      }
    }

    if (tappedString !== -1) {
      triggerStringPluck(tappedString, 0.82, 0, 'down');
    }

    strumPointers.set(e.pointerId, {
      lastX: x,
      lastY: y,
      lastTime: performance.now(),
      lastPluckedString: tappedString,
    });

    state.strumTrails.push({ x, y, alpha: 1.0 });
  });

  strumZone.addEventListener('pointermove', (e) => {
    const pState = strumPointers.get(e.pointerId);
    if (!pState) return;

    const rect = stringCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const now = performance.now();
    const dt = Math.max(4, now - pState.lastTime);
    const dx = x - pState.lastX;

    state.strumTrails.push({ x, y, alpha: 1.0 });

    if (Math.abs(dx) > 1.5) {
      const { xs: stringXs } = getStringLayout();
      const direction = (dx > 0) !== state.leftHanded ? 'down' : 'up';
      // Calculate normalized velocity from swipe speed (px/ms)
      const speedPxPerMs = Math.abs(dx) / dt;
      const velocity = Math.min(1.0, Math.max(0.45, 0.48 + speedPxPerMs * 0.28));

      // Find all strings crossed between lastX and x
      const crossed = [];
      for (let s = 0; s < 6; s++) {
        const sx = stringXs[s];
        const crossedRight = pState.lastX < sx && x >= sx;
        const crossedLeft = pState.lastX > sx && x <= sx;
        if (crossedRight || crossedLeft) {
          const ratio = Math.abs((sx - pState.lastX) / dx);
          crossed.push({ stringIdx: s, ratio });
        }
      }

      // Sort in order of crossing and stagger audio trigger times for smooth strum feel
      crossed.sort((a, b) => a.ratio - b.ratio);
      crossed.forEach((item, idx) => {
        if (item.stringIdx !== pState.lastPluckedString || crossed.length > 1) {
          const offsetSec = Math.min(0.06, idx * 0.011);
          triggerStringPluck(item.stringIdx, velocity, offsetSec, direction);
          pState.lastPluckedString = item.stringIdx;
        }
      });
    }

    pState.lastX = x;
    pState.lastY = y;
    pState.lastTime = now;
  });

  function releaseStrumPointer(e) {
    strumPointers.delete(e.pointerId);
  }

  strumZone.addEventListener('pointerup', releaseStrumPointer);
  strumZone.addEventListener('pointercancel', releaseStrumPointer);
  strumZone.addEventListener('lostpointercapture', releaseStrumPointer);

  // --- Canvas Rendering for Vibrating Strings & Touch Trails ---
  const canvasCtx = stringCanvas.getContext('2d');

  function resizeCanvas() {
    const rect = stringCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    stringCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
    stringCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resizeCanvas);

  function renderStringsLoop() {
    const rect = stringCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvasCtx.clearRect(0, 0, w, h);

    const { xs: stringXs } = getStringLayout();

    // Draw touch trails
    for (let i = state.strumTrails.length - 1; i >= 0; i--) {
      const pt = state.strumTrails[i];
      canvasCtx.beginPath();
      canvasCtx.arc(pt.x, pt.y, 10 * pt.alpha, 0, Math.PI * 2);
      canvasCtx.fillStyle = `rgba(251, 191, 36, ${pt.alpha * 0.35})`;
      canvasCtx.fill();
      pt.alpha -= 0.06;
      if (pt.alpha <= 0) {
        state.strumTrails.splice(i, 1);
      }
    }

    // Draw 6 strings with standing-wave vibration
    for (let s = 0; s < 6; s++) {
      const str = STRINGS[s];
      const vib = state.vibrations[s];
      const baseX = stringXs[s];

      canvasCtx.save();
      canvasCtx.beginPath();

      if (vib.amplitude > 0.15) {
        vib.phase += 0.45 + s * 0.06;
        vib.amplitude *= 0.945;
        const displacement = Math.sin(vib.phase) * vib.amplitude;

        canvasCtx.moveTo(baseX, 0);
        canvasCtx.quadraticCurveTo(baseX + displacement, h * 0.5, baseX, h);

        canvasCtx.shadowColor = 'rgba(251, 191, 36, 0.75)';
        canvasCtx.shadowBlur = 8;
        canvasCtx.strokeStyle = '#fde68a';
      } else {
        vib.amplitude = 0;
        canvasCtx.moveTo(baseX, 0);
        canvasCtx.lineTo(baseX, h);
        canvasCtx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        canvasCtx.shadowBlur = 4;
        canvasCtx.strokeStyle = str.color;
      }

      canvasCtx.lineWidth = str.gauge;
      canvasCtx.stroke();
      canvasCtx.restore();
    }

    requestAnimationFrame(renderStringsLoop);
  }

  // --- Mode & Toolbar Controls ---
  const appShell = document.querySelector('.app-shell');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeValue = document.getElementById('volume-value');
  const muteToggleBtn = document.getElementById('mute-toggle-btn');
  const neckWidthSlider = document.getElementById('neck-width-slider');
  const neckWidthValue = document.getElementById('neck-width-value');
  const alignButtons = document.querySelectorAll('.align-btn');
  const leftyToggleBtn = document.getElementById('lefty-toggle-btn');

  function applyVolume(volumePercent, isMuted = false) {
    const clampedVol = Math.min(100, Math.max(0, Math.round(Number(volumePercent) ?? 85)));
    state.volume = clampedVol;
    state.isMuted = Boolean(isMuted) || clampedVol === 0;

    if (volumeSlider) volumeSlider.value = String(clampedVol);
    if (volumeValue) volumeValue.textContent = state.isMuted ? 'Mute' : `${clampedVol}%`;
    if (muteToggleBtn) {
      muteToggleBtn.setAttribute('aria-pressed', String(state.isMuted));
      muteToggleBtn.textContent = state.isMuted ? '🔇' : clampedVol < 40 ? '🔉' : '🔊';
    }

    synth.updateMasterGain();

    try {
      localStorage.setItem('pocketGuitar.volume', String(clampedVol));
      localStorage.setItem('pocketGuitar.muted', state.isMuted ? '1' : '0');
    } catch (_) {}
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
      const val = Number(volumeSlider.value);
      applyVolume(val, val === 0);
    });
  }

  if (muteToggleBtn) {
    muteToggleBtn.addEventListener('click', () => {
      if (state.isMuted && state.volume === 0) {
        applyVolume(85, false);
      } else {
        applyVolume(state.volume, !state.isMuted);
      }
    });
  }

  function applyNeckLayout(widthPercent, align) {
    const clampedWidth = Math.min(100, Math.max(50, Number(widthPercent) || 76));
    const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
    const justify = justifyMap[align] || 'center';

    appShell.style.setProperty('--neck-width', `${clampedWidth}%`);
    appShell.style.setProperty('--neck-justify', justify);

    if (neckWidthSlider) neckWidthSlider.value = String(clampedWidth);
    if (neckWidthValue) neckWidthValue.textContent = `${clampedWidth}%`;

    alignButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.align === align);
    });

    try {
      localStorage.setItem('pocketGuitar.neckWidth', String(clampedWidth));
      localStorage.setItem('pocketGuitar.neckAlign', align);
    } catch (_) {}
  }

  function applyLeftHanded(isLefty) {
    state.leftHanded = Boolean(isLefty);
    appShell.classList.toggle('is-lefty', state.leftHanded);
    if (leftyToggleBtn) {
      leftyToggleBtn.setAttribute('aria-pressed', String(state.leftHanded));
    }
    updateFretboardVisuals();
    try {
      localStorage.setItem('pocketGuitar.leftHanded', state.leftHanded ? '1' : '0');
    } catch (_) {}
  }

  if (neckWidthSlider) {
    neckWidthSlider.addEventListener('input', () => {
      const currentAlign = document.querySelector('.align-btn.active')?.dataset.align || 'center';
      applyNeckLayout(neckWidthSlider.value, currentAlign);
    });
  }

  alignButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const align = btn.dataset.align || 'center';
      applyNeckLayout(neckWidthSlider ? neckWidthSlider.value : 76, align);
    });
  });

  if (leftyToggleBtn) {
    leftyToggleBtn.addEventListener('click', () => {
      applyLeftHanded(!state.leftHanded);
    });
  }

  function setMode(newMode) {
    state.mode = newMode;
    const isFretboard = newMode === 'fretboard';
    modeFretboardBtn.classList.toggle('active', isFretboard);
    modeFretboardBtn.setAttribute('aria-selected', String(isFretboard));
    modeChordBtn.classList.toggle('active', !isFretboard);
    modeChordBtn.setAttribute('aria-selected', String(!isFretboard));

    fretboardView.classList.toggle('active', isFretboard);
    chordView.classList.toggle('active', !isFretboard);

    updateFretboardVisuals();
  }

  modeFretboardBtn.addEventListener('click', () => setMode('fretboard'));
  modeChordBtn.addEventListener('click', () => setMode('chord'));

  toneSelect.addEventListener('change', () => {
    state.tone = toneSelect.value;
    synth.rebuildToneChain();
  });

  capoSelect.addEventListener('change', () => {
    state.capo = parseInt(capoSelect.value, 10) || 0;
    updateFretboardVisuals();
  });

  holdToggleBtn.addEventListener('click', () => {
    state.holdMode = !state.holdMode;
    holdToggleBtn.setAttribute('aria-pressed', String(state.holdMode));
    if (holdStateText) holdStateText.textContent = state.holdMode ? 'ON' : 'OFF';
    updateFretboardVisuals();
  });

  guideChipsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.guide-chip');
    if (!chip) return;
    const chordId = chip.dataset.guide || '';
    state.guideChordId = chordId;

    guideChipsContainer.querySelectorAll('.guide-chip').forEach((btn) => {
      btn.classList.toggle('active', btn === chip);
    });

    // If Latch Mode is ON and user selects a guide chord, also apply its shape for immediate testing
    if (chordId && state.holdMode) {
      selectChord(chordId, false);
    } else {
      updateFretboardVisuals();
    }
  });

  clearFretsBtn.addEventListener('click', () => {
    state.latchedFrets.fill(0);
    state.nutMuted.fill(false);
    state.fretPointers.clear();
    updateFretboardVisuals();
  });

  chordTapStrumCheckbox.addEventListener('change', () => {
    state.tapStrumInChordMode = chordTapStrumCheckbox.checked;
  });

  strumDownBtn.addEventListener('click', () => triggerFullStrum('down', 0.85));
  strumUpBtn.addEventListener('click', () => triggerFullStrum('up', 0.8));

  // --- PC Keyboard Shortcuts for Testing & Hybrid Play ---
  const KEY_TO_CHORD = {
    Digit1: 'C',
    Digit2: 'G',
    Digit3: 'Am',
    Digit4: 'F',
    Digit5: 'Em',
    Digit6: 'D',
    Digit7: 'Dm',
    Digit8: 'E7',
    Digit9: 'A',
  };

  const KEY_TO_STRING = {
    KeyQ: 0,
    KeyW: 1,
    KeyE: 2,
    KeyR: 3,
    KeyT: 4,
    KeyY: 5,
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.target.closest('select, input, textarea')) return;

    if (KEY_TO_CHORD[e.code]) {
      state.holdMode = true;
      holdToggleBtn.setAttribute('aria-pressed', 'true');
      if (holdStateText) holdStateText.textContent = 'ON';
      selectChord(KEY_TO_CHORD[e.code], state.tapStrumInChordMode);
    } else if (e.code === 'Space' || e.code === 'ArrowDown') {
      e.preventDefault();
      triggerFullStrum('down', 0.85);
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      triggerFullStrum('up', 0.8);
    } else if (KEY_TO_STRING[e.code] !== undefined) {
      const col = KEY_TO_STRING[e.code];
      const stringIdx = state.leftHanded ? 5 - col : col;
      triggerStringPluck(stringIdx, 0.85, 0, 'down');
    }
  });

  // --- Initialize ---
  let savedVolume = 85;
  let savedMuted = false;
  let savedWidth = 76;
  let savedAlign = 'center';
  let savedLefty = false;
  try {
    const rawVol = localStorage.getItem('pocketGuitar.volume');
    if (rawVol !== null) savedVolume = Number(rawVol);
    savedMuted = localStorage.getItem('pocketGuitar.muted') === '1';
    savedWidth = Number(localStorage.getItem('pocketGuitar.neckWidth')) || 76;
    savedAlign = localStorage.getItem('pocketGuitar.neckAlign') || 'center';
    savedLefty = localStorage.getItem('pocketGuitar.leftHanded') === '1';
  } catch (_) {}

  buildUI();
  applyVolume(savedVolume, savedMuted);
  applyNeckLayout(savedWidth, savedAlign);
  applyLeftHanded(savedLefty);
  requestAnimationFrame(() => {
    resizeCanvas();
    renderStringsLoop();
  });
})();
