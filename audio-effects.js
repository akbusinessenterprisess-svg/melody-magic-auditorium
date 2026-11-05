
export class VirtualAudioEffects {
  constructor() {
    this.monitorLevel = 0.35;
    this.monitorEnabled = false;
    this.context = null;
    this.source = null;
    this.destination = null;
    this.output = null;
    this.processedTrack = null;
    this.monitorGain = null;
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

      const dry = this.context.createGain();

      const echoSend = this.context.createGain();
      const echoDelay = this.context.createDelay(1);
      const echoFeedback = this.context.createGain();
      const echoReturn = this.context.createGain();

      const reverbSend = this.context.createGain();
      const convolver = this.context.createConvolver();
      const reverbReturn = this.context.createGain();

      const wetBus = this.context.createGain();
      const outputGain = this.context.createGain();

      // Create a 2-second reverb impulse
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

      // Dry vocal
      this.source.connect(dry);

      // Echo
      this.source.connect(echoSend);
      echoSend.connect(echoDelay);
      echoDelay.connect(echoFeedback);
      echoFeedback.connect(echoDelay);
      echoDelay.connect(echoReturn);

      // Reverb
      this.source.connect(reverbSend);
      reverbSend.connect(convolver);
      convolver.connect(reverbReturn);

      // Combine effects
      echoReturn.connect(wetBus);
      reverbReturn.connect(wetBus);

      dry.connect(outputGain);
      wetBus.connect(outputGain);

      // Send processed voice to LiveKit
      outputGain.connect(this.destination);

      // Separate local headphone monitoring
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
        outputGain
      };

      // Initial settings
      this.setEcho(20);
      this.setReverb(20);
      this.setMix(25);
      this.setVolume(80);
      this.setMonitorVolume(35);
      await this.setMonitor(false);

      return this.processedTrack;

    } catch (error) {
      this.stop();
      throw error;
    }
  }

  setEcho(value) {
    if (!this.context || !this.nodes) return;

    const amount = Math.max(0, Math.min(100, Number(value))) / 100;
    const now = this.context.currentTime;

    this.nodes.echoDelay.delayTime.setTargetAtTime(
      0.12 + amount * 0.38,
      now,
      0.02
    );

    this.nodes.echoFeedback.gain.setTargetAtTime(
      amount * 0.45,
      now,
      0.02
    );

    this.nodes.echoSend.gain.setTargetAtTime(
      amount * 0.7,
      now,
      0.02
    );
  }

  setReverb(value) {
    if (!this.context || !this.nodes) return;

    const amount = Math.max(0, Math.min(100, Number(value))) / 100;

    this.nodes.reverbSend.gain.setTargetAtTime(
      amount * 0.6,
      this.context.currentTime,
      0.02
    );
  }

  setMix(value) {
    if (!this.context || !this.nodes) return;

    const amount = Math.max(0, Math.min(100, Number(value))) / 100;

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

    const amount = Math.max(0, Math.min(100, Number(value))) / 100;

    this.nodes.outputGain.gain.setTargetAtTime(
      amount,
      this.context.currentTime,
      0.02
    );
  }

  setMonitorVolume(value) {
  if (!this.context || !this.monitorGain) return;

  const amount = Math.max(0, Math.min(100, Number(value))) / 100;
  this.monitorLevel = amount;

  this.monitorGain.gain.setTargetAtTime(
    this.monitorEnabled ? amount : 0,
    this.context.currentTime,
    0.03
  );
}

async setMonitor(enabled) {
  if (!this.context || !this.monitorGain) return;

  if (this.context.state === "suspended") {
    await this.context.resume();
  }

  this.monitorEnabled = enabled;

  this.monitorGain.gain.setTargetAtTime(
    enabled ? this.monitorLevel : 0,
    this.context.currentTime,
    0.05
  );
}
  stop() {
    try {
      if (this.source) {
        this.source.disconnect();
      }

      if (this.nodes) {
        Object.values(this.nodes).forEach(node => {
          try {
            node.disconnect();
          } catch (error) {}
        });
      }

      if (this.monitorGain) {
        this.monitorGain.disconnect();
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
    this.monitorGain = null;
    this.nodes = null;
  }
}
