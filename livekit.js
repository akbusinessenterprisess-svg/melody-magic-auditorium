
import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  createLocalVideoTrack
} from "https://esm.sh/livekit-client@2";

import { VirtualAudioEffects } from "./audio-effects.js";

const LIVEKIT_URL =
  "wss://melody-magic-auditorium-wrgjlqio.livekit.cloud";

const TOKEN_SERVER =
  "https://lucky-night-b9bfmelody-magic-token-server.akbusinessenterprisess.workers.dev/";

let room = null;
let localMic = null;
let audioEffects = null;
let processedMicTrack = null;
let localCamera = null;
let mainSinger = null;

const participants = new Map();

function createPanel() {
  if (document.getElementById("livekitPanel")) return;

  const panel = document.createElement("div");
  panel.id = "livekitPanel";

  panel.style.cssText = `
    position:fixed;
    inset:10px;
    z-index:99999;
    background:#090909;
    color:white;
    padding:15px;
    border:1px solid #c9a34a;
    border-radius:14px;
    font-family:Arial,sans-serif;
    overflow:auto;
  `;

  panel.innerHTML = `
    <h2 style="color:#d6b45b;text-align:center">
      🎤 Melody Magic Digital Auditorium
    </h2>

    <div style="max-width:500px;margin:auto">

      <input
        id="liveSingerName"
        placeholder="Your singer name"
        style="width:100%;box-sizing:border-box;padding:12px;margin:5px 0"
      >

      <input
        id="liveRoomName"
        value="melody-test-room"
        placeholder="Room name"
        style="width:100%;box-sizing:border-box;padding:12px;margin:5px 0"
      >

      <button
        id="liveJoin"
        style="width:100%;padding:13px;background:#c9a34a"
      >
        JOIN LIVE AUDITORIUM
      </button>

      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button id="liveMic" style="flex:1;padding:12px">
          Mute Mic
        </button>

        <button id="liveMonitor" data-enabled="false" style="flex:1;padding:12px">
          Monitor My Voice: OFF
        </button>

        <button id="liveCamera" style="flex:1;padding:12px">
          Turn Camera Off
        </button>

        <button id="liveLeave" style="flex:1;padding:12px">
          Leave
        </button>
      </div>

      <p id="liveStatus" style="text-align:center;color:#d6b45b">
        Not connected
      </p>

      <h3 style="color:#d6b45b;text-align:center">
        ⭐ MAIN SINGER STAGE
      </h3>

      <div id="mainStage" style="
        max-width:850px;
        margin:10px auto;
        background:#202020;
        border:2px solid #c9a34a;
        border-radius:12px;
        min-height:220px;
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:hidden
      ">
        <p>Waiting for the main singer...</p>
      </div>

      <h3 style="color:#d6b45b">
        🎵 SINGERS IN THE AUDITORIUM
      </h3>

      <div id="singerGrid" style="
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
        gap:10px
      "></div>

    </div>
  `;

  document.body.appendChild(panel);

  document.getElementById("liveJoin").onclick = joinAuditorium;
  document.getElementById("liveMic").onclick = toggleMicrophone;
  document.getElementById("liveMonitor").onclick = toggleMonitor;
  document.getElementById("liveCamera").onclick = toggleCamera;
  document.getElementById("liveLeave").onclick = leaveAuditorium;
}

function status(message) {
  const element = document.getElementById("liveStatus");
  if (element) element.textContent = message;
}

function makeSingerTile(identity, name) {
  const grid = document.getElementById("singerGrid");
  if (!grid) return null;

  let tile = document.getElementById("singer-" + identity);
  if (tile) return tile;

  tile = document.createElement("div");
  tile.id = "singer-" + identity;

  tile.style.cssText = `
    background:#202020;
    border:1px solid #c9a34a;
    border-radius:10px;
    padding:8px;
    text-align:center;
    overflow:hidden;
  `;

  const title = document.createElement("p");
  title.textContent = name;
  title.style.color = "#d6b45b";

  const videoBox = document.createElement("div");
  videoBox.id = "video-" + identity;

  videoBox.style.cssText = `
    background:#000;
    min-height:100px;
    display:flex;
    align-items:center;
    justify-content:center;
    overflow:hidden;
  `;

  const button = document.createElement("button");
  button.textContent = "Make Main Singer";
  button.style.cssText = "width:100%;padding:8px;margin-top:8px";

  button.onclick = () => {
    mainSinger = identity;
    showMainSinger(identity);
  };

  tile.append(title, videoBox, button);
  grid.appendChild(tile);

  return tile;
}

function showMainSinger(identity) {
  const stage = document.getElementById("mainStage");
  if (!stage) return;

  stage.innerHTML = "";

  const participant = participants.get(identity);

  if (!participant) {
    stage.textContent = "Waiting for singer video...";
    return;
  }

  if (participant.videoTrack) {
    const video = participant.videoTrack.attach();

    video.autoplay = true;
    video.playsInline = true;
    video.style.cssText =
      "width:100%;max-height:450px;object-fit:contain";

    stage.appendChild(video);
  } else {
    const message = document.createElement("p");
    message.textContent =
      participant.name + " is on the main stage";

    stage.appendChild(message);
  }
}

function addParticipant(identity, name) {
  if (participants.has(identity)) return;

  participants.set(identity, {
    name,
    videoTrack: null
  });

  makeSingerTile(identity, name);

  if (!mainSinger) {
    mainSinger = identity;
    showMainSinger(identity);
  }
}

async function joinAuditorium() {
  if (room) return;

  const name =
    document.getElementById("liveSingerName").value.trim();

  const roomName =
    document.getElementById("liveRoomName").value.trim();

  if (!name || !roomName) {
    alert("Please enter your name and room name.");
    return;
  }

  const joinButton = document.getElementById("liveJoin");
  joinButton.disabled = true;

  try {
    status("Getting access token...");

    const response = await fetch(TOKEN_SERVER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        room: roomName,
        identity: name + "-" + Date.now()
      })
    });

    const data = await response.json();

    if (!response.ok || !data.token) {
      throw new Error(
        data.error || "Token generation failed"
      );
    }

    room = new Room();

    room.on(
      RoomEvent.ParticipantConnected,
      participant => {
        addParticipant(
          participant.identity,
          participant.name || participant.identity
        );
      }
    );

    room.on(
      RoomEvent.ParticipantDisconnected,
      participant => {
        const identity = participant.identity;

        participants.delete(identity);

        document.getElementById(
          "singer-" + identity
        )?.remove();

        if (mainSinger === identity) {
          mainSinger = null;

          document.getElementById("mainStage").textContent =
            "Waiting for the main singer...";
        }
      }
    );

    room.on(
      RoomEvent.TrackSubscribed,
      (track, publication, participant) => {
        if (track.kind === "audio") {
          const audio = track.attach();

          audio.autoplay = true;
          audio.playsInline = true;
          audio.style.display = "none";

          document.body.appendChild(audio);

          audio.play().catch(error => {
            console.warn("Remote audio playback needs interaction:", error);
          });
        }

        if (track.kind === "video") {
          addParticipant(
            participant.identity,
            participant.name || participant.identity
          );

          const person = participants.get(participant.identity);
          person.videoTrack = track;

          const video = track.attach();

          video.autoplay = true;
          video.playsInline = true;
          video.style.cssText =
            "width:100%;max-height:150px;object-fit:cover";

          const videoBox = document.getElementById(
            "video-" + participant.identity
          );

          if (videoBox) {
            videoBox.innerHTML = "";
            videoBox.appendChild(video);
          }

          if (mainSinger === participant.identity) {
            showMainSinger(participant.identity);
          }
        }
      }
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (track, publication, participant) => {
        track.detach().forEach(element => element.remove());

        if (track.kind === "video") {
          const person = participants.get(participant.identity);

          if (person) person.videoTrack = null;

          if (mainSinger === participant.identity) {
            showMainSinger(participant.identity);
          }
        }
      }
    );

    room.on(RoomEvent.Disconnected, () => {
      status("Disconnected");
    });

    status("Connecting...");

    await room.connect(LIVEKIT_URL, data.token);

    addParticipant(room.localParticipant.identity, name);

    // Open the original microphone.
    localMic = await createLocalAudioTrack({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    });

    // Start virtual echo and reverb processing.
    audioEffects = new VirtualAudioEffects();

    processedMicTrack = await audioEffects.start(
      localMic.mediaStreamTrack
    );

    // Publish processed audio to the audience.
    await room.localParticipant.publishTrack(
      processedMicTrack
    );

    // Start camera.
    localCamera = await createLocalVideoTrack();

    await room.localParticipant.publishTrack(localCamera);

    const localPerson = participants.get(
      room.localParticipant.identity
    );

    localPerson.videoTrack = localCamera;

    const localVideo = localCamera.attach();

    localVideo.autoplay = true;
    localVideo.muted = true;
    localVideo.playsInline = true;

    localVideo.style.cssText =
      "width:100%;max-height:150px;object-fit:cover";

    const localBox = document.getElementById(
      "video-" + room.localParticipant.identity
    );

    if (localBox) {
      localBox.innerHTML = "";
      localBox.appendChild(localVideo);
    }

    mainSinger = room.localParticipant.identity;
    showMainSinger(mainSinger);

    document.getElementById("liveMic").textContent = "Mute Mic";
    document.getElementById("liveMonitor").dataset.enabled = "false";
    document.getElementById("liveMonitor").textContent =
      "Monitor My Voice: OFF";

    status("Connected! Microphone and camera are LIVE.");

  } catch (error) {
    console.error("Join error:", error);

    status("Error: " + error.message);
    alert("Connection failed: " + error.message);

    await leaveAuditorium();
  } finally {
    if (!room) joinButton.disabled = false;
  }
}

async function toggleMicrophone() {
  if (!localMic) {
    return alert("Join the auditorium first.");
  }

  try {
    if (localMic.isMuted) {
      await localMic.unmute();

      document.getElementById("liveMic").textContent =
        "Mute Mic";
    } else {
      await localMic.mute();

      document.getElementById("liveMic").textContent =
        "Unmute Mic";
    }
  } catch (error) {
    console.error("Microphone error:", error);
    alert("Unable to change microphone setting.");
  }
}

// Local headphone monitoring.
async function toggleMonitor() {
  if (!audioEffects) {
    return alert("Join the auditorium first.");
  }

  const button = document.getElementById("liveMonitor");
  if (!button) return;

  const enabled = button.dataset.enabled !== "true";

  try {
    await audioEffects.setMonitor(enabled);

    button.dataset.enabled = String(enabled);

    button.textContent = enabled
      ? "Monitor My Voice: ON"
      : "Monitor My Voice: OFF";

    status(
      enabled
        ? "Voice monitoring is ON. Speak into your microphone."
        : "Voice monitoring is OFF."
    );

  } catch (error) {
    console.error("Monitor error:", error);

    alert(
      "Unable to start voice monitoring. Please try again."
    );
  }
}

async function toggleCamera() {
  if (!localCamera) {
    return alert("Join the auditorium first.");
  }

  try {
    if (localCamera.isMuted) {
      await localCamera.unmute();

      document.getElementById("liveCamera").textContent =
        "Turn Camera Off";
    } else {
      await localCamera.mute();

      document.getElementById("liveCamera").textContent =
        "Turn Camera On";
    }
  } catch (error) {
    console.error("Camera error:", error);
    alert("Unable to change camera setting.");
  }
}

async function leaveAuditorium() {
  // Turn off and clean up local audio effects.
  if (audioEffects) {
    audioEffects.stop();
    audioEffects = null;
  }

  processedMicTrack = null;

  // Disconnect LiveKit room.
  if (room) {
    try {
      await room.disconnect();
    } catch (error) {
      console.error("Disconnect error:", error);
    }

    room = null;
  }

  // Stop microphone.
  if (localMic) {
    localMic.stop();
    localMic = null;
  }

  // Stop camera.
  if (localCamera) {
    localCamera.stop();
    localCamera = null;
  }

  participants.clear();
  mainSinger = null;

  const grid = document.getElementById("singerGrid");
  if (grid) grid.innerHTML = "";

  const stage = document.getElementById("mainStage");
  if (stage) {
    stage.textContent = "Waiting for the main singer...";
  }

  document.querySelectorAll("#livekitPanel audio").forEach(audio => {
    audio.pause();
    audio.remove();
  });

  const joinButton = document.getElementById("liveJoin");
  if (joinButton) joinButton.disabled = false;

  document.getElementById("liveMic").textContent = "Mute Mic";
  document.getElementById("liveCamera").textContent = "Turn Camera Off";

  const monitorButton = document.getElementById("liveMonitor");

  if (monitorButton) {
    monitorButton.dataset.enabled = "false";
    monitorButton.textContent = "Monitor My Voice: OFF";
  }

  status("You have left the auditorium.");
}

createPanel();
