
// Melody Magic Digital Auditorium
// Virtual Echo and Reverb Audio Processor

export class VirtualAudioEffects {
  constructor() {
    this.context = null;
    this.inputStream = null;
    this.source = null;
    this.output = null;
    this.processedTrack = null;

    this.nodes = {};
  }

  async start(inputTrack) {
  if (this.context) {
    throw new Error("Audio effects are already running.");
  }

  if (!inputTrack || inputTrack.readyState !== "live") {
    throw new Error("A live microphone track is required.");
  }

  this.inputStream = new MediaStream([inputTrack]);

  try {
    this.context = new AudioContext();
    if (this.context) {
      throw new Error("Audio effects are already running.");
    }

    this.inputStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    try {
      this.context = new AudioContext();
      await this.context.resume();

      const ctx = this.context;

      this.source = ctx.createMediaStreamSource(this.inputStream);

      const dry = ctx.createGain();
      const echoSend = ctx.createGain();
      const echoDelay = ctx.createDelay(1);
      const echoFeedback = ctx.createGain();
      const echoReturn = ctx.createGain();

      const reverbSend = ctx.createGain();
      const convolver = ctx.createConvolver();
      const reverbReturn = ctx.createGain();

      const wetBus = ctx.createGain();
      const outputGain = ctx.createGain();

      const destination = ctx.createMediaStreamDestination();

      // Create a two-second synthetic reverb impulse.
      const length = Math.floor(ctx.sampleRate * 2);
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);

        for (let i = 0; i < length; i++) {
          const decay = Math.pow(1 - i / length, 3);
          data[i] = (Math.random() * 2 - 1) * decay;
        }
      }

      convolver.buffer = impulse;

      // Dry microphone path.
      this.source.connect(dry);

      // Echo path with feedback.
      this.source.connect(echoSend);
      echoSend.connect(echoDelay);
      echoDelay.connect(echoFeedback);
      echoFeedback.connect(echoDelay);
      echoDelay.connect(echoReturn);

      // Reverb path.
      this.source.connect(reverbSend);
      reverbSend.connect(convolver);
      convolver.connect(reverbReturn);

      // Combine processed signals.
      echoReturn.connect(wetBus);
      reverbReturn.connect(wetBus);

      dry.connect(outputGain);
      wetBus.connect(outputGain);

      // Send only to LiveKit's outgoing audio track.
      outputGain.connect(destination);

      this.output = outputGain;
      this.processedTrack = destination.stream.getAudioTracks()[0];

      this.nodes = {
        dry,
        echoDelay,
        echoFeedback,
        echoReturn,
        reverbReturn,
        wetBus,
        outputGain
      };

      this.setEcho(25);
      this.setReverb(30);
      this.setMix(30);
      this.setVolume(80);

      return this.processedTrack;

    } catch (error) {
      this.stop();
      throw error;
    }
  }

  setEcho(value) {
    if (!this.context) return;

    const amount = Math.max(0, Math.min(100, value)) / 100;
    const n = this.nodes;

    n.echoDelay.delayTime.setTargetAtTime(
      0.12 + amount * 0.38,
      this.context.currentTime,
      0.02
    );

    n.echoFeedback.gain.setTargetAtTime(
      amount * 0.45,
      this.context.currentTime,
      0.02
    );

    n.echoReturn.gain.setTargetAtTime(
      amount,
      this.context.currentTime,
      0.02
    );
  }

  setReverb(value) {
    if (!this.context) return;

    const amount = Math.max(0, Math.min(100, value)) / 100;

    this.nodes.reverbReturn.gain.setTargetAtTime(
      amount,
      this.context.currentTime,
      0.02
    );
  }

  setMix(value) {
    if (!this.context) return;

    const amount = Math.max(0, Math.min(100, value)) / 100;
    const n = this.nodes;

    n.dry.gain.setTargetAtTime(
      1 - amount * 0.5,
      this.context.currentTime,
      0.02
    );

    n.wetBus.gain.setTargetAtTime(
      amount,
      this.context.currentTime,
      0.02
    );
  }

  setVolume(value) {
    if (!this.context) return;

    const amount = Math.max(0, Math.min(100, value)) / 100;

    this.nodes.outputGain.gain.setTargetAtTime(
      amount,
      this.context.currentTime,
      0.02
    );
  }

  stop() {
    if (this.inputStream) {
      this.inputStream.getTracks().forEach(track => track.stop());
      this.inputStream = null;
    }

    if (this.processedTrack) {
      this.processedTrack.stop();
      this.processedTrack = null;
    }

    if (this.context) {
      this.context.close().catch(console.error);
      this.context = null;
    }

    this.source = null;
    this.output = null;
    this.nodes = {};
  }
}
