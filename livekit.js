import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  createLocalVideoTrack
} from "https://esm.sh/livekit-client@2";

import { VirtualAudioEffects } from "./audio-effects.js";

import { auth, db } from "./firebase.js";

import {
  ref,
  get,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const LIVEKIT_URL =
  "wss://melody-magic-auditorium-wrgjlqio.livekit.cloud";

const TOKEN_SERVER =
  "https://lucky-night-b9bfmelody-magic-token-server.akbusinessenterprisess.workers.dev/";

const showId = new URLSearchParams(window.location.search)
  .get("showId");

let room = null;
let localMic = null;
let audioEffects = null;
let processedMicTrack = null;
let localCamera = null;

let currentUser = null;
let isHost = false;
let hostUid = "";
let stageSingerUids = [];
let registrations = {};

let stopStageListener = null;
let stopQueueListener = null;

const participants = new Map();

function waitForUser() {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

function createPanel() {
  if (document.getElementById("livekitPanel")) return;

  const panel = document.createElement("div");
  panel.id = "livekitPanel";

  panel.style.cssText = `
    position:relative;
    width:100%;
    max-width:900px;
    margin:10px auto;
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

    <div style="max-width:700px;margin:auto">

      <p id="showRoomInfo" style="text-align:center;color:#d6b45b">
        Loading show...
      </p>

      <input
        id="liveSingerName"
        placeholder="Your singer name"
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
        Checking show access...
      </p>

      <section id="hostStageControls" style="
        display:none;
        margin-top:18px;
        padding:12px;
        border:1px solid #c9a34a;
        border-radius:10px;
      ">
        <h3 style="color:#d6b45b">HOST CONTROL — SINGER QUEUE</h3>

        <p>Select a queued singer who has joined the auditorium.</p>

        <select id="stageSingerSelect" style="
          width:100%;
          padding:12px;
          margin-bottom:8px;
        ">
          <option value="">Select a connected singer</option>
        </select>

        <button id="makeMainSinger" style="
          width:100%;
          padding:12px;
          background:#c9a34a;
          color:#000;
          font-weight:bold;
        ">
          MAKE MAIN SINGER
        </button>
      </section>

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
        overflow:hidden;
      ">
        <p>Waiting for the host to select a singer...</p>
      </div>

      <h3 style="color:#d6b45b">
        🎵 SINGERS IN THE AUDITORIUM
      </h3>

      <div id="singerGrid" style="
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
        gap:10px;
      "></div>

    </div>
  `;

  const target = document.getElementById("livekitArea") || document.body;
  target.appendChild(panel);

  document.getElementById("liveJoin").onclick = joinAuditorium;
  document.getElementById("liveMic").onclick = toggleMicrophone;
  document.getElementById("liveMonitor").onclick = toggleMonitor;
  document.getElementById("liveCamera").onclick = toggleCamera;
  document.getElementById("liveLeave").onclick = leaveAuditorium;
  document.getElementById("makeMainSinger").onclick = selectMainSinger;
}

function status(message) {
  const element = document.getElementById("liveStatus");
  if (element) element.textContent = message;
}

function displayName(uid) {
  if (uid === currentUser?.uid) {
    return document.getElementById("liveSingerName")?.value.trim()
      || "You";
  }

  const registration = Object.values(registrations)
    .find(item => item && item.singerUid === uid);

  if (registration) return registration.name || "Singer";

  return participants.get(uid)?.name || "Participant";
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

  tile.append(title, videoBox);
  grid.appendChild(tile);

  return tile;
}

function showMainSinger(uids) {
  const stage = document.getElementById("mainStage");
  if (!stage) return;

  stage.innerHTML = "";

  const singerList = Array.isArray(uids)
    ? uids.filter(Boolean)
    : uids ? [uids] : [];

  if (singerList.length === 0) {
    stage.textContent = "Waiting for the host to select a singer...";
    return;
  }

  stage.style.cssText =
    "display:grid;grid-template-columns:repeat(" +
    Math.min(singerList.length, 2) +
    ",minmax(0,1fr));gap:12px;width:100%";

  singerList.forEach(uid => {
    const participant = participants.get(uid);

    const singerBox = document.createElement("div");
    singerBox.style.cssText =
      "background:#181818;padding:10px;border-radius:10px;text-align:center;min-width:0";

    const heading = document.createElement("p");
    heading.textContent = "⭐ " + displayName(uid);
    heading.style.cssText =
      "color:#d6b45b;font-weight:bold;text-align:center";

    singerBox.appendChild(heading);

    if (!participant) {
      const message = document.createElement("p");
      message.textContent = "Singer is not connected yet.";
      singerBox.appendChild(message);
    } else if (participant.videoTrack) {
      const video = participant.videoTrack.attach();
      video.autoplay = true;
      video.playsInline = true;
      video.style.cssText =
        "width:100%;max-height:450px;object-fit:contain";
      singerBox.appendChild(video);
    } else {
      const message = document.createElement("p");
      message.textContent = "Singer is on stage. Camera is off.";
      singerBox.appendChild(message);
    }

    stage.appendChild(singerBox);
  });
}

  const participant = participants.get(uid);

  const heading = document.createElement("p");
  heading.textContent = "⭐ " + displayName(uid);
  heading.style.cssText =
    "color:#d6b45b;font-weight:bold;text-align:center";

  if (!participant) {
    stage.appendChild(heading);

    const message = document.createElement("p");
    message.textContent = "Singer is not connected yet.";
    stage.appendChild(message);
    return;
  }

  if (participant.videoTrack) {
    const video = participant.videoTrack.attach();

    video.autoplay = true;
    video.playsInline = true;
    video.style.cssText =
      "width:100%;max-height:450px;object-fit:contain";

    stage.append(heading, video);
  } else {
    stage.appendChild(heading);

    const message = document.createElement("p");
    message.textContent = "Singer is on stage. Camera is off.";
    stage.appendChild(message);
  }
}

function addParticipant(identity, name) {
  if (participants.has(identity)) return;

  participants.set(identity, {
    name: name || identity,
    videoTrack: null
  });

  makeSingerTile(identity, name || identity);
  updateSingerOptions();
}

function updateSingerOptions() {
  if (!isHost) return;

  const select = document.getElementById("stageSingerSelect");
  if (!select) return;

  const previousValue = select.value;

  select.innerHTML =
    '<option value="">Select a connected singer</option>';

  const queued = Object.entries(registrations)
    .filter(([id, item]) =>
      item &&
      item.status === "Queued" &&
      participants.has(item.singerUid)
    );

  queued.forEach(([registrationId, item]) => {
    const option = document.createElement("option");
    option.value = registrationId;
    option.textContent = item.name + " — " + (item.song || "Song not specified");
    select.appendChild(option);
  });

  if ([...select.options].some(option => option.value === previousValue)) {
    select.value = previousValue;
  }
}

async function selectMainSinger() {
  if (!isHost || !currentUser || !showId) {
    status("Only the show's host can select the main singer.");
    return;
  }

  const registrationId =
    document.getElementById("stageSingerSelect").value;

  if (!registrationId) {
    alert("Please select a connected queued singer.");
    return;
  }

  const singer = registrations[registrationId];

  if (!singer || singer.status !== "Queued") {
    alert("This singer is not in the queue.");
    return;
  }

  if (!participants.has(singer.singerUid)) {
    alert("This singer must join the auditorium first.");
    return;
  }

  try {
    await set(ref(db, "liveStage/" + showId), {
      registrationId,
      singerUid: singer.singerUid,
      singerName: singer.name || "Singer",
      updatedAt: Date.now()
    });

    status("Main singer selected: " + (singer.name || "Singer"));
  } catch (error) {
    console.error("Stage selection error:", error);
    status("Unable to select singer: " + error.message);
  }
}

function listenToStage() {
  if (stopStageListener) stopStageListener();

  const stageRef = ref(db, "liveStage/" + showId);

  stopStageListener = onValue(stageRef, snapshot => {
    const stageData = snapshot.val();

    if (Array.isArray(stageData?.singerUids)) {
      stageSingerUids = stageData.singerUids.filter(Boolean);
    } else {
      stageSingerUids = stageData?.singerUid
        ? [stageData.singerUid]
        : [];
    }

    showMainSinger(stageSingerUids);

    const names = Array.isArray(stageData?.singerNames)
      ? stageData.singerNames
      : stageData?.singerName
        ? [stageData.singerName]
        : [];

    if (names.length) {
      status(
        names.length > 1
          ? "Duet singers: " + names.join(" & ")
          : "Main singer: " + names[0]
      );
    } else {
      status("No singer selected on stage.");
    }
  }, error => {
    console.error("Stage listener error:", error);
    status("Unable to load stage selection.");
  });
}

function listenToHostQueue() {
  if (!isHost || stopQueueListener) return;

  const queueRef = ref(db, "showRegistrations/" + showId);

  stopQueueListener = onValue(queueRef, snapshot => {
    registrations = snapshot.val() || {};
    updateSingerOptions();
  }, error => {
    console.error("Queue listener error:", error);
    status("Unable to load singer queue.");
  });
}

async function initializeShow() {
  createPanel();

  if (!showId) {
    status("Show ID missing. Open the auditorium using the show's join link.");
    document.getElementById("liveJoin").disabled = true;
    return;
  }

  try {
    currentUser = await waitForUser();

    if (!currentUser) {
      status("Please sign in before joining this auditorium.");
      document.getElementById("liveJoin").disabled = true;
      return;
    }

    const showSnapshot = await get(ref(db, "shows/" + showId));

    if (!showSnapshot.exists()) {
      status("This show could not be found.");
      document.getElementById("liveJoin").disabled = true;
      return;
    }

    const show = showSnapshot.val();

    if (show.status !== "Published") {
      status("This show is not currently published.");
      document.getElementById("liveJoin").disabled = true;
      return;
    }

    hostUid = show.hostUid || "";
    isHost = currentUser.uid === hostUid;

    document.getElementById("showRoomInfo").textContent =
      "Show: " + (show.title || showId);

    if (isHost) {
      document.getElementById("hostStageControls").style.display = "block";
      listenToHostQueue();
    }

    listenToStage();

    status(isHost
      ? "Host verified. You can manage the singer stage."
      : "Show loaded. Waiting for the host.");

  } catch (error) {
    console.error("Show initialization error:", error);
    status("Unable to verify show access: " + error.message);
    document.getElementById("liveJoin").disabled = true;
  }
}

async function joinAuditorium() {
  if (room) return;

  if (!currentUser || !showId) {
    return alert("Show access is not ready. Please refresh the page.");
  }

  const name =
    document.getElementById("liveSingerName").value.trim();

  if (!name) {
    alert("Please enter your name.");
    return;
  }

  const joinButton = document.getElementById("liveJoin");
  joinButton.disabled = true;

  try {
    status("Getting access token...");

    const roomName = "melody-show-" + showId;

    const response = await fetch(TOKEN_SERVER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        room: roomName,
        identity: currentUser.uid
      })
    });

    const data = await response.json();

    if (!response.ok || !data.token) {
      throw new Error(data.error || "Token generation failed");
    }

    room = new Room();

    room.on(RoomEvent.ParticipantConnected, participant => {
      addParticipant(
        participant.identity,
        participant.name || participant.identity
      );
    });

    room.on(RoomEvent.ParticipantDisconnected, participant => {
      const identity = participant.identity;

      participants.delete(identity);

      document.getElementById("singer-" + identity)?.remove();

      if (stageSingerUid === identity) {
        showMainSinger(stageSingerUid);
      }

      updateSingerOptions();
    });

    room.on(
      RoomEvent.TrackSubscribed,
      (track, publication, participant) => {
        addParticipant(
          participant.identity,
          participant.name || participant.identity
        );

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

          if (stageSingerUid === participant.identity) {
            showMainSinger(stageSingerUid);
          }
        }

        updateSingerOptions();
      }
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (track, publication, participant) => {
        track.detach().forEach(element => element.remove());

        if (track.kind === "video") {
          const person = participants.get(participant.identity);

          if (person) person.videoTrack = null;

          if (stageSingerUid === participant.identity) {
            showMainSinger(stageSingerUid);
          }
        }
      }
    );

    room.on(RoomEvent.Disconnected, () => {
      status("Disconnected from auditorium.");
    });

    status("Connecting to show room...");

    await room.connect(LIVEKIT_URL, data.token);

    addParticipant(
      room.localParticipant.identity,
      name
    );

    localMic = await createLocalAudioTrack({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    });

    audioEffects = new VirtualAudioEffects();

    processedMicTrack = await audioEffects.start(
      localMic.mediaStreamTrack
    );

    await room.localParticipant.publishTrack(processedMicTrack);

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

    if (stageSingerUid) {
      showMainSinger(stageSingerUid);
    }

    document.getElementById("liveMic").textContent = "Mute Mic";
    document.getElementById("liveMonitor").dataset.enabled = "false";
    document.getElementById("liveMonitor").textContent =
      "Monitor My Voice: OFF";

    status("Connected to " + roomName + ". Microphone and camera are LIVE.");

    updateSingerOptions();

  } catch (error) {
    console.error("Join error:", error);

    status("Connection error: " + error.message);
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
      document.getElementById("liveMic").textContent = "Mute Mic";
    } else {
      await localMic.mute();
      document.getElementById("liveMic").textContent = "Unmute Mic";
    }
  } catch (error) {
    console.error("Microphone error:", error);
    alert("Unable to change microphone setting.");
  }
}

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

  } catch (error) {
    console.error("Monitor error:", error);
    alert("Unable to start voice monitoring.");
  }
}

async function toggleCamera() {
  if (!localCamera) {
    return alert("Join the auditorium first.");
  }

  try {
    if (localCamera.isMuted) {
      await localCamera.unmute();
      document.getElementById("liveCamera").textContent = "Turn Camera Off";
    } else {
      await localCamera.mute();
      document.getElementById("liveCamera").textContent = "Turn Camera On";
    }
  } catch (error) {
    console.error("Camera error:", error);
    alert("Unable to change camera setting.");
  }
}

async function leaveAuditorium() {
  if (audioEffects) {
    audioEffects.stop();
    audioEffects = null;
  }

  processedMicTrack = null;

  if (room) {
    try {
      await room.disconnect();
    } catch (error) {
      console.error("Disconnect error:", error);
    }

    room = null;
  }

  if (localMic) {
    localMic.stop();
    localMic = null;
  }

  if (localCamera) {
    localCamera.stop();
    localCamera = null;
  }

  participants.clear();

  const grid = document.getElementById("singerGrid");
  if (grid) grid.innerHTML = "";

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
initializeShow();
