// Melody Magic Digital Auditorium
// Virtual Echo & Reverb Processor

export class VirtualAudioEffects {
  constructor() {
    this.context = null;
    this.source = null;
    this.destination = null;
    this.inputStream = null;
    this.processedTrack = null;
  }

  async start() {
    this.inputStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    this.context = new AudioContext();

    await this.context.resume();

    this.source = this.context.createMediaStreamSource(
      this.inputStream
    );

    const dryGain = this.context.createGain();
    const wetGain = this.context.createGain();
    const outputGain = this.context.createGain();

    const delay = this.context.createDelay(2);
    const feedback = this.context.createGain();

    const convolver = this.context.createConvolver();

    // Create a natural synthetic reverb impulse
    const length = this.context.sampleRate * 2;
    const impulse = this.context.createBuffer(
      2,
      length,
      this.context.sampleRate
    );

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) *
          Math.pow(1 - i / length, 3);
      }
    }

    convolver.buffer = impulse;

    // Echo feedback loop
    delay.delayTime.value = 0.28;
    feedback.gain.value = 0.25;

    this.source.connect(dryGain);
    this.source.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);

    delay.connect(wetGain);
    wetGain.connect(outputGain);

    this.source.connect(convolver);
    convolver.connect(wetGain);

    dryGain.connect(outputGain);

    outputGain.connect(this.context.destination);

    this.destination =
      this.context.createMediaStreamDestination();

    outputGain.connect(this.destination);

    this.processedTrack =
      this.destination.stream.getAudioTracks()[0];

    this.setEcho(25);
    this.setReverb(30);
    this.setMix(30);
    this.setVolume(80);

    return this.processedTrack;
  }

  setEcho(value) {
    if (!this.context) return;

    const amount = value / 100;

    this.context._echoFeedback =
      0.05 + amount * 0.45;

    this.context._echoDelay =
      0.12 + amount * 0.45;

    this.context._echoWet =
      amount;
  }

  setReverb(value) {
    if (!this.context) return;

    this.context._reverbAmount = value / 100;
  }

  setMix(value) {
    if (!this.context) return;

    const amount = value / 100;

    this.context._dryLevel = 1 - amount * 0.5;
    this.context._wetLevel = amount;
  }

  setVolume(value) {
    if (!this.context) return;

    this.context._micVolume = value / 100;
  }

  stop() {
    if (this.inputStream) {
      this.inputStream.getTracks().forEach(track => track.stop());
    }

    if (this.processedTrack) {
      this.processedTrack.stop();
    }

    if (this.context) {
      this.context.close();
    }

    this.context = null;
  }
}
