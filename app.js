(() => {
  const panel = document.getElementById('synth');
  const startButton = document.getElementById('start');
  const wifi = document.getElementById('wifi');
  const status = document.getElementById('status');
  const volumeInputs = [document.getElementById('volume-1'), document.getElementById('volume-2')];
  const voiceButtons = [document.getElementById('voice-1'), document.getElementById('voice-2')];
  const effectTriggers = [...document.querySelectorAll('.effect-trigger')];
  const effectVolumeInputs = [document.getElementById('slider-1-flutter'), document.getElementById('slider-2-flutter')];
  const voices = [];
  const effectLevels = [];
  let audioContext;
  let engineStarted = false;
  let blinkTimer;
  const grooveStep = 60 / 72 / 4;
  const leftMelodyStep = grooveStep * 2;
  const phraseDuration = grooveStep * 128;
  const rightMelodyStep = phraseDuration / 32;
  let musicEpoch = 0;

  // Eight-bar arc in A minor: Am, Am, F, C, G, Dm, E, Am.
  const patterns = [
    [110, 0, 164.81, 0, 130.81, 0, 164.81, 0,
      110, 0, 130.81, 0, 164.81, 0, 220, 0,
      87.31, 0, 130.81, 0, 174.61, 0, 130.81, 0,
      130.81, 0, 164.81, 0, 196, 0, 164.81, 0,
      98, 0, 146.83, 0, 196, 0, 246.94, 0,
      73.42, 0, 146.83, 0, 174.61, 0, 220, 0,
      82.41, 0, 164.81, 0, 207.65, 0, 246.94, 0,
      110, 0, 164.81, 0, 130.81, 0, 110, 0],
    [329.63, 261.63, 220, 0,
      329.63, 261.63, 329.63, 220,
      261.63, 220, 261.63, 174.61,
      196, 329.63, 196, 261.63,
      293.66, 246.94, 196, 293.66,
      220, 174.61, 293.66, 220,
      246.94, 207.65, 329.63, 246.94,
      220, 261.63, 329.63, 440]
  ];
  const sirenSteps = [[102], []];
  const scrapeSteps = [[110], []];
  const bassLine = [
    [0, 55, 0.8, 4], [12, 82.41, 0.55, 2],
    [16, 55, 0.8, 4], [28, 82.41, 0.55, 2],
    [32, 43.65, 0.8, 4], [44, 65.41, 0.55, 2],
    [48, 65.41, 0.8, 4], [60, 98, 0.55, 2],
    [64, 49, 0.8, 4], [76, 73.42, 0.55, 2],
    [80, 36.71, 0.8, 4], [92, 55, 0.55, 2],
    [96, 41.2, 0.9, 4], [108, 61.74, 0.65, 2],
    [112, 55, 0.65, 6], [124, 82.41, 0.35, 2]
  ];
  const kickSequence = [[0, 0.42], [16, 0.48], [32, 0.56], [40, 0.36], [48, 0.58], [56, 0.42],
    [64, 0.7], [72, 0.52], [78, 0.32], [80, 0.78], [88, 0.6], [94, 0.35],
    [96, 0.95], [104, 0.74], [110, 0.5], [112, 0.62]];
  const rightKickSequence = [[0, 0.32], [32, 0.4], [64, 0.55], [80, 0.62], [96, 0.76], [112, 0.28]];
  const snareSequence = [[28, 0.28], [36, 0.42], [52, 0.5], [68, 0.58], [76, 0.3],
    [84, 0.72], [92, 0.42], [100, 0.86], [108, 0.6], [116, 0.25]];
  const arrangementEnergy = [0.3, 0.36, 0.48, 0.58, 0.7, 0.84, 1, 0.34];
  const bassButtonLine = [55, 0, 0, 0, 55, 0, 0, 0, 43.65, 0, 0, 0, 65.41, 0, 0, 0,
    49, 0, 0, 0, 36.71, 0, 0, 0, 41.2, 0, 0, 0, 55, 0, 0, 0];
  const rareHatSteps = [26, 58, 74, 90, 106];
  const openHatSteps = [24, 42, 60, 88, 106];

  function makeImpulse(context, seconds, decay) {
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return impulse;
  }

  function makeShaper(amount) {
    const curve = new Float32Array(2048);
    const k = 1 + amount * 40;
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (curve.length - 1) - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  function createVoice(index) {
    const context = audioContext;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = index === 0 ? 980 : 1450;
    filter.Q.value = 1.2;

    const shaper = context.createWaveShaper();
    shaper.curve = makeShaper(index === 0 ? 0.08 : 0.1);
    shaper.oversample = '2x';
    const dry = context.createGain();
    const delay = context.createDelay(1.2);
    const feedback = context.createGain();
    const wet = context.createGain();
    const convolver = context.createConvolver();
    const reverb = context.createGain();
    const level = context.createGain();
    const panner = context.createStereoPanner();

    delay.delayTime.value = index === 0 ? leftMelodyStep : grooveStep * 2;
    feedback.gain.value = index === 0 ? 0.16 : 0.08;
    wet.gain.value = 0.1;
    convolver.buffer = makeImpulse(context, index === 0 ? 2.1 : 0.85, index === 0 ? 2.8 : 1.5);
    reverb.gain.value = index === 0 ? 0.19 : 0.08;
    level.gain.value = 0;
    panner.pan.value = index === 0 ? -0.78 : 0.78;

    filter.connect(shaper);
    shaper.connect(dry);
    shaper.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    shaper.connect(convolver);
    convolver.connect(reverb);
    dry.connect(level);
    wet.connect(level);
    reverb.connect(level);
    level.connect(panner);
    panner.connect(context.destination);

    return {
      index, filter, shaper, delay, feedback, wet, reverb, level, active: false,
      nextTime: context.currentTime + 0.08, step: 0, stepSeconds: index === 0 ? leftMelodyStep : rightMelodyStep, timer: null
    };
  }

  function setParam(param, value, duration = 0.12) {
    const now = audioContext.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, duration);
  }

  function nextGridPoint() {
    const now = audioContext.currentTime;
    const absoluteStep = Math.max(0, Math.ceil((now + 0.025 - musicEpoch) / grooveStep));
    return { step: absoluteStep % 128, time: musicEpoch + absoluteStep * grooveStep };
  }

  function setLevel(voice) {
    const value = voice.active ? Number(volumeInputs[voice.index].value) * 0.32 : 0;
    setParam(voice.level.gain, value, 0.09);
  }

  function playNote(voice, frequency, time, long = false) {
    const context = audioContext;
    const osc = context.createOscillator();
    const double = voice.index === 0 ? context.createOscillator() : null;
    const doubleGain = double ? context.createGain() : null;
    const oscGain = context.createGain();
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(Math.min(3400, frequency * 8), time);
    osc.type = voice.index === 0 ? 'sawtooth' : 'triangle';
    const rightVoice = voice.index === 1;
    if (rightVoice) {
      osc.frequency.setValueAtTime(voice.lastFrequency || frequency, time);
      osc.frequency.exponentialRampToValueAtTime(frequency, time + 0.16);
      voice.lastFrequency = frequency;
    } else {
      osc.frequency.setValueAtTime(frequency, time);
    }
    if (long) osc.frequency.exponentialRampToValueAtTime(frequency * 1.33, time + 0.26);
    if (double) {
      double.type = 'triangle';
      double.frequency.setValueAtTime(frequency * 1.004, time);
      doubleGain.gain.value = 0.2;
      if (long) double.frequency.exponentialRampToValueAtTime(frequency * 1.33 * 1.004, time + 0.26);
    }
    const peak = long ? 0.15 : (voice.index === 0 ? 0.13 : 0.095);
    const sustain = voice.index === 0 ? 0.045 : 0.042;
    oscGain.gain.setValueAtTime(0.0001, time);
    oscGain.gain.exponentialRampToValueAtTime(peak, time + (rightVoice ? 0.11 : 0.035));
    oscGain.gain.setTargetAtTime(sustain, time + (long ? 0.22 : (rightVoice ? 0.11 : 0.13)), long ? 0.16 : (rightVoice ? 0.1 : 0.07));
    const releaseAt = long ? 0.53 : (rightVoice ? voice.stepSeconds * 0.74 : 0.23);
    oscGain.gain.setTargetAtTime(0.0001, time + releaseAt, rightVoice ? 0.12 : 0.045);
    osc.connect(tone);
    if (double) {
      double.connect(doubleGain);
      doubleGain.connect(tone);
      double.start(time);
      double.stop(time + (long ? 0.82 : 0.48));
    }
    tone.connect(oscGain);
    oscGain.connect(voice.filter);
    osc.start(time);
    osc.stop(time + (rightVoice ? voice.stepSeconds + 0.24 : (long ? 0.82 : 0.48)));
  }

  function playSiren(voice, time) {
    const context = audioContext;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const base = voice.index === 0 ? 220 : 165;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, time);
    osc.frequency.linearRampToValueAtTime(base * 1.5, time + 0.34);
    osc.frequency.linearRampToValueAtTime(base * 0.92, time + 0.74);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.045, time + 0.1);
    gain.gain.setTargetAtTime(0.0001, time + 0.64, 0.12);
    osc.connect(gain);
    gain.connect(voice.filter);
    osc.start(time);
    osc.stop(time + 1.05);
  }

  function playScrape(voice, time) {
    const context = audioContext;
    const length = Math.floor(context.sampleRate * 0.36);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    const band = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    band.type = 'bandpass';
    band.frequency.setValueAtTime(1400, time);
    band.frequency.exponentialRampToValueAtTime(480, time + 0.27);
    band.Q.value = 3.5;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.055, time + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    source.connect(band);
    band.connect(gain);
    gain.connect(voice.filter);
    source.start(time);
  }

  // Button accents use their own fixed level and pan, independent of voice faders and FX sliders.
  function startButtonSiren(isRight, destination) {
    const context = audioContext;
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modDepth = context.createGain();
    const now = context.currentTime;
    filter.type = 'lowpass';
    filter.frequency.value = isRight ? 1850 : 680;
    pan.pan.value = isRight ? 0.82 : -0.82;
    carrier.type = isRight ? 'triangle' : 'sawtooth';
    carrier.frequency.value = isRight ? 329.63 : 220;
    modulator.type = isRight ? 'triangle' : 'sine';
    modulator.frequency.value = isRight ? 0.12 : 0.08;
    modDepth.gain.value = isRight ? 6 : 12;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(isRight ? 0.035 : 0.055, now + 0.5);
    carrier.connect(filter);
    filter.connect(envelope);
    envelope.connect(pan);
    pan.connect(destination);
    modulator.connect(modDepth);
    modDepth.connect(carrier.frequency);
    carrier.start(now);
    modulator.start(now);
    return {
      stop() {
        const stopAt = context.currentTime;
        envelope.gain.cancelScheduledValues(stopAt);
        envelope.gain.setTargetAtTime(0.0001, stopAt, 0.12);
        carrier.stop(stopAt + 0.7);
        modulator.stop(stopAt + 0.7);
      }
    };
  }

  function hitHat(context, destination, time, isRight = false, open = false) {
    const length = Math.floor(context.sampleRate * (open ? 0.52 : 0.045));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    highpass.type = 'highpass';
    highpass.frequency.value = isRight ? 7600 : 6200;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(open ? 0.09 : (isRight ? 0.17 : 0.12), time + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + (open ? 0.48 : (isRight ? 0.035 : 0.052)));
    source.connect(highpass);
    highpass.connect(envelope);
    envelope.connect(destination);
    source.start(time);
  }

  function hitKick(context, destination, time, isRight = false, strength = 1, variant = 0) {
    const osc = context.createOscillator();
    const envelope = context.createGain();
    osc.type = 'sine';
    const startHz = isRight ? (variant ? 210 : 165) : 180;
    const endHz = isRight ? (variant ? 55 : 41.2) : 41.2;
    osc.frequency.setValueAtTime(startHz, time);
    osc.frequency.exponentialRampToValueAtTime(endHz, time + 0.05);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime((isRight ? 0.3 : 0.34) * strength, time + 0.001);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
    osc.connect(envelope);
    envelope.connect(destination);
    osc.start(time);
    osc.stop(time + 0.46);
  }

  function hitSnare(context, destination, time, velocity = 0.8) {
    const length = Math.floor(context.sampleRate * 0.28);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const body = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    highpass.type = 'highpass';
    highpass.frequency.value = 520;
    body.type = 'peaking';
    body.frequency.value = 1900;
    body.Q.value = 0.8;
    body.gain.value = 3;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(0.23 * velocity, time + 0.001);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    source.connect(highpass);
    highpass.connect(body);
    body.connect(envelope);
    envelope.connect(destination);
    source.start(time);
  }

  function playBass(context, destination, time, frequency, velocity, durationSteps, stepDuration, strength) {
    const osc = context.createOscillator();
    const filterEnvelope = context.createBiquadFilter();
    const outputFilter = context.createBiquadFilter();
    const shaper = context.createWaveShaper();
    const envelope = context.createGain();
    const hold = durationSteps * stepDuration;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, time);
    filterEnvelope.type = 'lowpass';
    filterEnvelope.Q.value = 2;
    filterEnvelope.frequency.setValueAtTime(120 * Math.pow(2, 2.6), time);
    filterEnvelope.frequency.exponentialRampToValueAtTime(120, time + 0.2);
    outputFilter.type = 'lowpass';
    outputFilter.frequency.value = 700;
    shaper.curve = makeShaper(0.2);
    shaper.oversample = '2x';
    const peak = 0.24 * velocity * strength;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(peak, time + 0.01);
    envelope.gain.setTargetAtTime(peak * 0.42, time + 0.01, 0.08);
    envelope.gain.setTargetAtTime(0.0001, time + hold, 0.11);
    osc.connect(filterEnvelope);
    filterEnvelope.connect(outputFilter);
    outputFilter.connect(shaper);
    shaper.connect(envelope);
    envelope.connect(destination);
    osc.start(time);
    osc.stop(time + hold + 0.5);
  }

  function startButtonLoop(kind, isRight) {
    const context = audioContext;
    const destination = effectLevels[isRight ? 1 : 0];
    const lane = context.createGain();
    lane.gain.value = 0.0001;
    lane.gain.setTargetAtTime(isRight ? 0.68 : 0.82, context.currentTime, 0.045);
    lane.connect(destination);

    if (kind === 'siren') {
      const siren = startButtonSiren(isRight, lane);
      return { stop: () => { siren.stop(); lane.gain.setTargetAtTime(0.0001, context.currentTime, 0.08); } };
    }

    if (kind === 'bass') {
      const point = nextGridPoint();
      const state = {
        active: true,
        step: point.step,
        nextTime: point.time
      };
      const scheduler = window.setInterval(() => {
        while (state.active && state.nextTime < context.currentTime + 0.11) {
          if (state.step % 4 === 0) {
            const note = bassButtonLine[Math.floor(state.step / 4)];
            if (note) {
              const bar = Math.floor(state.step / 16);
              playBass(context, lane, state.nextTime, note, 0.78, 12, grooveStep, arrangementEnergy[bar]);
            }
          }
          state.step = (state.step + 1) % 128;
          state.nextTime += grooveStep;
        }
      }, 20);
      return {
        getSyncPoint: () => ({ step: state.step, nextTime: state.nextTime }),
        stop() {
          state.active = false;
          window.clearInterval(scheduler);
          lane.gain.setTargetAtTime(0.0001, context.currentTime, 0.04);
        }
      };
    }

    const interval = grooveStep;
    const active = { value: true };
    const point = nextGridPoint();
    let nextTime = point.time;
    let step = point.step;
    const scheduler = window.setInterval(() => {
      while (active.value && nextTime < context.currentTime + 0.11) {
        const bar = Math.floor(step / 16);
        if (kind === 'beat') {
          const kick = kickSequence.find(([at]) => at === step);
          const snare = snareSequence.find(([at]) => at === step);
          const bass = bassLine.find(([at]) => at === step);
          if (kick) hitKick(context, lane, nextTime, false, kick[1] * arrangementEnergy[bar]);
          if (snare) hitSnare(context, lane, nextTime, snare[1] * arrangementEnergy[bar]);
          if (bass) playBass(context, lane, nextTime, bass[1], bass[2], bass[3], interval, arrangementEnergy[bar]);
        } else if (kind === 'hat' && rareHatSteps.includes(step)) {
          hitHat(context, lane, nextTime, false);
        } else if (kind === 'openHat' && openHatSteps.includes(step)) {
          hitHat(context, lane, nextTime, true, true);
        } else if (kind === 'kick') {
          const kick = rightKickSequence.find(([at]) => at === step);
          if (kick) hitKick(context, lane, nextTime, true, kick[1] * arrangementEnergy[bar], (bar + 1) % 2);
        }
        step = (step + 1) % 128;
        nextTime += interval;
      }
    }, 20);
    return {
      stop() {
        active.value = false;
        window.clearInterval(scheduler);
        lane.gain.setTargetAtTime(0.0001, context.currentTime, 0.04);
      }
    };
  }

  function triggerEffect(button) {
    if (!engineStarted) {
      status.textContent = 'Сначала нажмите START';
      return;
    }
    const isRight = button.classList.contains('right');
    const isActive = button.getAttribute('aria-pressed') === 'true';
    const labelBySound = {
      beat: ['Включить левый бит', 'Выключить левый бит'],
      bass: ['Включить бас', 'Выключить бас'],
      hat: ['Включить левый хэт', 'Выключить левый хэт'],
      siren: ['Включить правую высокую сирену', 'Выключить правую высокую сирену'],
      kick: ['Включить правый кик', 'Выключить правый кик'],
      openHat: ['Включить правый открытый хэт', 'Выключить правый открытый хэт']
    };
    const statusBySound = { beat: 'Ритм включён', bass: 'Бас включён', hat: 'Хэт включён', siren: 'Сирена включена', kick: 'Кик включён', openHat: 'Открытый хэт включён' };
    if (isActive) {
      button.loopSound?.stop();
      button.loopSound = null;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', labelBySound[button.dataset.sound][0]);
      status.textContent = 'Звуковой цикл выключен';
      return;
    }
    button.loopSound = startButtonLoop(button.dataset.sound, isRight);
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', labelBySound[button.dataset.sound][1]);
    status.textContent = statusBySound[button.dataset.sound];
  }

  function schedule(voice) {
    const context = audioContext;
    while (voice.active && voice.nextTime < context.currentTime + 0.12) {
      const step = voice.step;
      const isNoteStep = voice.index === 0 ? step % 2 === 0 : step % 4 === 0;
      const noteIndex = voice.index === 0 ? Math.floor(step / 2) : Math.floor(step / 4);
      const note = isNoteStep ? patterns[voice.index][noteIndex] : 0;
      if (note) playNote(voice, note, voice.nextTime, sirenSteps[voice.index].includes(step));
      if (sirenSteps[voice.index].includes(step)) playSiren(voice, voice.nextTime);
      if (scrapeSteps[voice.index].includes(step)) playScrape(voice, voice.nextTime + 0.12);
      voice.step = (step + 1) % 128;
      voice.nextTime += grooveStep;
    }
  }

  function toggleVoice(index) {
    if (!engineStarted) {
      status.textContent = 'Сначала нажмите START';
      return;
    }
    const voice = voices[index];
    voice.active = !voice.active;
    const button = voiceButtons[index];
    button.setAttribute('aria-pressed', String(voice.active));
    button.setAttribute('aria-label', `${voice.active ? 'Выключить' : 'Включить'} ${index === 0 ? 'первую' : 'вторую'} мелодию`);
    status.textContent = `Мелодия ${index + 1} ${voice.active ? 'включена' : 'выключена'}`;
    setLevel(voice);
    if (voice.active) {
      const point = nextGridPoint();
      voice.step = point.step;
      voice.nextTime = point.time;
      voice.timer = window.setInterval(() => schedule(voice), 25);
    } else {
      window.clearInterval(voice.timer);
      voice.timer = null;
    }
  }

  function stopAllMelodies() {
    voices.forEach((voice, index) => {
      if (!voice.active) return;
      voice.active = false;
      window.clearInterval(voice.timer);
      voice.timer = null;
      voiceButtons[index].setAttribute('aria-pressed', 'false');
      voiceButtons[index].setAttribute('aria-label', `Включить ${index === 0 ? 'первую' : 'вторую'} мелодию`);
      setLevel(voice);
    });
  }

  async function startEngine() {
    if (engineStarted) {
      stopAllMelodies();
      status.textContent = 'Обе мелодии выключены';
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      status.textContent = 'Этот браузер не поддерживает Web Audio API';
      return;
    }
    try {
      audioContext = new AudioContextClass();
      await audioContext.resume();
      musicEpoch = audioContext.currentTime + 0.12;
      for (let i = 0; i < 2; i++) {
        const level = audioContext.createGain();
        level.gain.value = Number(effectVolumeInputs[i].value);
        level.connect(audioContext.destination);
        effectLevels.push(level);
      }
      voices.push(createVoice(0), createVoice(1));
      updateVisuals();
      engineStarted = true;
      wifi.hidden = false;
      panel.classList.add('started');
      startButton.setAttribute('aria-pressed', 'true');
      startButton.setAttribute('aria-label', 'Остановить обе мелодии');
      status.textContent = 'Аудиосистема запущена. Выберите мелодию.';
      blinkTimer = window.setInterval(() => {
        wifi.classList.remove('blink');
        void wifi.offsetWidth;
        wifi.classList.add('blink');
      }, 60000);
    } catch (error) {
      status.textContent = 'Не удалось запустить аудиосистему';
    }
  }

  function updateVisuals() {
    const volumes = volumeInputs.map(input => Number(input.value));
    const mean = (volumes[0] + volumes[1]) / 2;
    const amount = Math.min(1, mean / 0.75);
    panel.style.setProperty('--reactor-opacity', amount.toFixed(3));
    panel.style.setProperty('--effect-opacity', (amount * 0.8).toFixed(3));
    volumeInputs.forEach((input, index) => {
      const wrapper = document.getElementById(`knob-wrap-${index + 1}`);
      const startAngle = index === 0 ? -153 : -45;
      const turn = startAngle + Number(input.value) * 306;
      wrapper.style.setProperty('--knob-turn', `${turn}deg`);
      if (voices[index]) setLevel(voices[index]);
    });
    document.querySelectorAll('.effect-slider input').forEach(input => {
      const thumb = input.nextElementSibling;
      thumb.style.setProperty('--thumb-x', `${Number(input.value) * 73}%`);
      const voice = voices[Number(input.closest('.effect-slider').dataset.voice) - 1];
      if (!voice) return;
      if (input.id.endsWith('tone')) {
        const cutoff = voice.index === 0
          ? 850 + Number(input.value) * 3930
          : 1050 + Number(input.value) * 6500;
        setParam(voice.filter.frequency, cutoff, 0.14);
      } else if (input.id.endsWith('space')) {
        const space = Number(input.value);
        setParam(voice.wet.gain, space * (voice.index === 0 ? 0.4 : 0.58), 0.14);
        setParam(voice.feedback.gain, space * (voice.index === 0 ? 0.24 : 0.45), 0.14);
        setParam(voice.reverb.gain, space * (voice.index === 0 ? 0.35 : 0.16), 0.14);
      } else if (input.id.endsWith('flutter')) {
        if (effectLevels[voice.index]) setParam(effectLevels[voice.index].gain, Number(input.value), 0.12);
      }
    });
  }

  function bindFineVolumeDrag(input) {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    input.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      input.focus();
      input.setPointerCapture(event.pointerId);
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    });
    input.addEventListener('pointermove', event => {
      if (!dragging) return;
      const movement = (event.clientX - lastX) - (event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
      const value = Math.max(0, Math.min(1, Number(input.value) + movement * 0.0025));
      input.value = String(Math.round(value * 200) / 200);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const release = () => { dragging = false; };
    input.addEventListener('pointerup', release);
    input.addEventListener('pointercancel', release);
    input.addEventListener('lostpointercapture', release);
  }

  startButton.addEventListener('click', startEngine);
  voiceButtons.forEach((button, index) => button.addEventListener('click', () => toggleVoice(index)));
  effectTriggers.forEach(button => button.addEventListener('click', () => triggerEffect(button)));
  volumeInputs.forEach(bindFineVolumeDrag);
  [...volumeInputs, ...document.querySelectorAll('.effect-slider input')].forEach(input => input.addEventListener('input', updateVisuals));
  updateVisuals();
  window.addEventListener('pagehide', () => {
    window.clearInterval(blinkTimer);
    voices.forEach(voice => window.clearInterval(voice.timer));
    effectTriggers.forEach(button => button.loopSound?.stop());
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
  });
})();
