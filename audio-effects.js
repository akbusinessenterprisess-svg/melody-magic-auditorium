export class VirtualAudioEffects {
  constructor() {
    this.context = null;
    this.source = null;
    this.destination = null;
    this.output = null;
    this.processedTrack = null;
    this.nodes = null;
  }

  async start(inputTrack) {
    try {
      this.context = new AudioContext();

      if (this.context.state === "suspended") {
        await this.context.resume();
      }

      const stream = new MediaStream([inputTrack]);

      this.source = this.context.createMediaStreamSource(stream);
      this.destination = this.context.createMediaStreamDestination();

      // Dry audio path.
      const dry = this.context.createGain();

      // Echo path.
      const echoSend = this.context.createGain();
      const echoDelay = this.context.createDelay(1);
      const echoFeedback = this.context.createGain();
      const echoReturn = this.context.createGain();

      // Reverb path.
      const reverbSend = this.context.createGain();
      const convolver = this.context.createConvolver();
      const reverbReturn = this.context.createGain();

      // Combined audio.
      const wetBus = this.context.createGain();
      const outputGain = this.context.createGain();

      // Create a simple reverb impulse.
      const length = this.context.sampleRate * 2;
      const impulse = this.context.createBuffer(
        2,
        length,
        this.context.sampleRate
      );

      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);

        for (let i = 0; i < length; i++) {
          data[i] =
            (Math.random() * 2 - 1) *
            Math.pow(1 - i / length, 3);
        }
      }

      convolver.buffer = impulse;

      // Echo connections.
      this.source.connect(dry);

      this.source.connect(echoSend);
      echoSend.connect(echoDelay);
      echoDelay.connect(echoFeedback);
      echoFeedback.connect(echoDelay);
      echoDelay.connect(echoReturn);

      // Reverb connections.
      this.source.connect(reverbSend);
      reverbSend.connect(convolver);
      convolver.connect(reverbReturn);

      // Combine signals.
      echoReturn.connect(wetBus);
      reverbReturn.connect(wetBus);

      dry.connect(outputGain);
      wetBus.connect(outputGain);

      // Send processed audio to LiveKit.
outputGain.connect(this.destination);

// Local headphone monitoring (OFF by default).
this.monitorGain = this.context.createGain();
this.monitorGain.gain.value = 0;

outputGain.connect(this.monitorGain);
this.monitorGain.connect(this.context.destination);
      this.output = outputGain;
      this.processedTrack =
        this.destination.stream.getAudioTracks()[0];

      this.nodes = {
  dry,
  echoSend,
  echoDelay,
  echoFeedback,
  echoReturn,
  reverbSend,
  reverbReturn,
  wetBus,
  outputGain,
  monitorGain: this.monitorGain
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
    if (!this.context || !this.nodes) return;

    const amount = Math.max(0, Math.min(100, value)) / 100;

    this.nodes.echoDelay.delayTime.setTargetAtTime(
      0.12 + amount * 0.38,
      this.context.currentTime,
      0.02
    );

    this.nodes.echoFeedback.gain.setTargetAtTime(
      amount * 0.55,
      this.context.currentTime,
      0.02
    );

    this.nodes.echoSend.gain.setTargetAtTime(
      amount,
      this.context.currentTime,
      0.02
    );
  }

  setReverb(value) {
    if (!this.context || !this.nodes) return;

    const amount = Math.max(0, Math.min(100, value)) / 100;

    this.nodes.reverbSend.gain.setTargetAtTime(
      amount,
      this.context.currentTime,
      0.02
    );
  }

  setMix(value) {
    if (!this.context || !this.nodes) return;

    const amount = Math.max(0, Math.min(100, value)) / 100;

    this.nodes.dry.gain.setTargetAtTime(
      1 - amount * 0.5,
      this.context.currentTime,
      0.02
    );

    this.nodes.wetBus.gain.setTargetAtTime(
      amount,
      this.context.currentTime,
      0.02
    );
  }

  setVolume(value) {
    if (!this.context || !this.nodes) return;

    const amount = Math.max(0, Math.min(100, value)) / 100;

    this.nodes.outputGain.gain.setTargetAtTime(
      amount,
      this.context.currentTime,
      0.02
    );
  }
  setMonitor(enabled) {
    if (!this.context || !this.monitorGain) return;

    this.monitorGain.gain.setTargetAtTime(
      enabled ? 0.7 : 0,
      this.context.currentTime,
      0.05
    );
  }
  stop() {
    try {
      if (this.source) this.source.disconnect();

      if (this.nodes) {
        Object.values(this.nodes).forEach(node => {
          try {
            node.disconnect();
          } catch (error) {}
        });
      }

      if (this.processedTrack) {
        this.processedTrack.stop();
      }

      if (this.context && this.context.state !== "closed") {
        this.context.close();
      }
    } catch (error) {
      console.error("Audio effects cleanup error:", error);
    }

    this.context = null;
    this.source = null;
    this.destination = null;
    this.output = null;
    this.processedTrack = null;
    this.nodes = null;
  }
}
