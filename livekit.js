import {
  Room,
  RoomEvent,
  createLocalAudioTrack
} from "https://esm.sh/livekit-client@2";

const LIVEKIT_URL =
  "wss://melody-magic-auditorium-wrgjlqio.livekit.cloud";

const TOKEN_SERVER =
  "https://lucky-night-b9bfmelody-magic-token-server.akbusinessenterprisess.workers.dev/";

let room = null;
let localMic = null;

function createPanel() {
  if (document.getElementById("livekitPanel")) return;

  const panel = document.createElement("div");
  panel.id = "livekitPanel";

  panel.style.cssText = `
    position:fixed;
    bottom:15px;
    right:15px;
    z-index:99999;
    background:#171717;
    color:white;
    padding:18px;
    border:1px solid #c9a34a;
    border-radius:12px;
    width:280px;
    font-family:Arial;
    box-shadow:0 4px 20px #000;
  `;

  panel.innerHTML = `
    <h3 style="color:#d6b45b;margin-top:0">
      🎤 Melody Magic Live
    </h3>

    <input id="liveSingerName"
      placeholder="Singer name"
      style="width:95%;padding:9px;margin-bottom:8px">

    <input id="liveRoomName"
      value="melody-test-room"
      placeholder="Room name"
      style="width:95%;padding:9px;margin-bottom:10px">

    <button id="liveJoin"
      style="width:100%;padding:10px;background:#c9a34a;border:0;cursor:pointer">
      JOIN LIVE AUDITORIUM
    </button>

    <button id="liveMic"
      style="width:100%;padding:10px;margin-top:7px">
      MUTE MICROPHONE
    </button>

    <button id="liveLeave"
      style="width:100%;padding:10px;margin-top:7px">
      LEAVE AUDITORIUM
    </button>

    <p id="liveStatus" style="font-size:13px">
      Not connected
    </p>

    <div id="liveRemoteAudio"></div>
  `;

  document.body.appendChild(panel);

  document.getElementById("liveJoin")
    .addEventListener("click", joinAuditorium);

  document.getElementById("liveMic")
    .addEventListener("click", toggleMicrophone);

  document.getElementById("liveLeave")
    .addEventListener("click", leaveAuditorium);
}

function status(message) {
  const element = document.getElementById("liveStatus");
  if (element) element.textContent = message;
}

async function joinAuditorium() {
  const name = document.getElementById("liveSingerName")
    .value.trim();

  const roomName = document.getElementById("liveRoomName")
    .value.trim();

  if (!name || !roomName) {
    alert("Enter singer name and room name.");
    return;
  }

  try {
    status("Getting secure access token...");

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
      throw new Error(data.error || "Token generation failed");
    }

    room = new Room();

    room.on(RoomEvent.TrackSubscribed, (track) => {
      const element = track.attach();
      document.getElementById("liveRemoteAudio")
        .appendChild(element);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach(element => element.remove());
    });

    room.on(RoomEvent.Disconnected, () => {
      status("Disconnected");
    });

    status("Connecting to LiveKit...");

    await room.connect(LIVEKIT_URL, data.token);

    localMic = await createLocalAudioTrack();

    await room.localParticipant.publishTrack(localMic);

    status("Connected! Microphone is LIVE.");

    document.getElementById("liveJoin").disabled = true;

  } catch (error) {
    console.error("LiveKit error:", error);
    status("Connection error: " + error.message);
    alert("LiveKit connection failed: " + error.message);
  }
}

async function toggleMicrophone() {
  if (!localMic) {
    alert("Join the auditorium first.");
    return;
  }

  const enabled = localMic.isMuted;

  if (enabled) {
    await localMic.unmute();
  } else {
    await localMic.mute();
  }

  document.getElementById("liveMic").textContent =
    enabled ? "MUTE MICROPHONE" : "UNMUTE MICROPHONE";
}

async function leaveAuditorium() {
  if (room) {
    await room.disconnect();
    room = null;
  }

  if (localMic) {
    localMic.stop();
    localMic = null;
  }

  document.getElementById("liveRemoteAudio").innerHTML = "";
  document.getElementById("liveJoin").disabled = false;

  status("You have left the auditorium.");
}

createPanel();
