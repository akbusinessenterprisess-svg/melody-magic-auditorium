
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

// Keep these exact project URLs
const LIVEKIT_URL =
  "wss://melody-magic-music-studio-wrgjlqio.livekit.cloud";

const TOKEN_SERVER =
  "https://lucky-night-b9bfmelody-magic-token-server.akbusinessenterprisess.workers.dev/";

const params = new URLSearchParams(window.location.search);
const showId = params.get("showId");

let room = null;
let localMic = null;
let localCamera = null;
let audioEffects = null;
let processedMicTrack = null;

let currentUser = null;
let currentShow = null;
let isHost = false;

let registrations = {};
let stageSingerUids = [];
let stageSingerNames = [];

let stopStageListener = null;
let stopQueueListener = null;

const participants = new Map();

const $ = id => document.getElementById(id);

function setStatus(message) {
  const element = $("livekitStatus");
  if (element) element.textContent = message;
}

function waitForUser() {
  return new Promise((resolve, reject) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();

      if (user) {
        resolve(user);
      } else {
        reject(new Error("Please sign in before joining the auditorium."));
      }
    });
  });
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function displayName(uid) {
  if (uid === currentUser?.uid) {
    const ownName = $("liveSingerName")?.value.trim();
    if (ownName) return ownName;
  }

  const registration = Object.values(registrations).find(
    item => item?.singerUid === uid
  );

  if (registration?.name) return registration.name;

  const participant = participants.get(uid);
  if (participant?.name) return participant.name;

  const stageIndex = stageSingerUids.indexOf(uid);
  if (stageIndex >= 0 && stageSingerNames[stageIndex]) {
    return stageSingerNames[stageIndex];
  }

  return "Singer";
}

function createPanel() {
  if ($("livekitPanel")) return;

  const panel = document.createElement("section");
  panel.id = "livekitPanel";

  panel.style.cssText = `
    background:#101010;
    color:white;
    padding:16px;
    border-radius:12px;
    margin:15px 0;
    font-family:Arial,sans-serif;
  `;

  panel.innerHTML = `
    <h2 style="color:#e5bd62;margin-top:0">
      🎤 Live Auditorium
    </h2>

    <p id="livekitStatus">
      Connecting to auditorium...
    </p>

    <label>Your singer name</label>
    <input id="liveSingerName"
      type="text"
      placeholder="Enter your name"
      style="display:block;width:100%;padding:11px;margin:7px 0 14px;box-sizing:border-box">

    <button id="joinLiveButton">JOIN LIVE AUDITORIUM</button>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
      <button id="micButton" disabled>Unmute Mic</button>
      <button id="monitorButton" disabled>Monitor My Voice OFF</button>
      <button id="cameraButton" disabled>Turn Camera Off</button>
      <button id="leaveButton" disabled>Leave</button>
    </div>

    <div id="audioControls"
      style="background:#202020;padding:12px;border-radius:10px;margin:12px 0">

      <h3 style="margin-top:0">🎚️ Vocal Effects</h3>

      <label>Echo: <span id="echoValue">20</span>%</label>
      <input id="echoSlider" type="range" min="0" max="100" value="20" style="width:100%">

      <label>Reverb: <span id="reverbValue">20</span>%</label>
      <input id="reverbSlider" type="range" min="0" max="100" value="20" style="width:100%">

      <label>Dry / Wet Mix: <span id="mixValue">25</span>%</label>
      <input id="mixSlider" type="range" min="0" max="100" value="25" style="width:100%">

      <label>Outgoing Voice Volume: <span id="volumeValue">80</span>%</label>
      <input id="volumeSlider" type="range" min="0" max="100" value="80" style="width:100%">

      <label>Headphone Monitor Volume: <span id="monitorVolumeValue">35</span>%</label>
      <input id="monitorVolumeSlider" type="range" min="0" max="100" value="35" style="width:100%">

      <p style="font-size:12px;color:#bbb">
        Use headphones when monitoring your own voice to reduce feedback.
      </p>
    </div>

    <div id="hostStageControls"
      style="display:none;background:#202020;padding:12px;border-radius:10px;margin:12px 0">

      <h3 style="margin-top:0">⭐ Host Stage Controls</h3>

      <label>Stage type</label>
      <select id="stageMode" style="display:block;width:100%;padding:10px;margin:7px 0">
        <option value="solo">Solo</option>
        <option value="duet">Duet</option>
      </select>

      <label>First singer</label>
      <select id="stageSingerOne" style="display:block;width:100%;padding:10px;margin:7px 0">
        <option value="">Waiting for connected singers...</option>
      </select>

      <div id="secondSingerArea" style="display:none">
        <label>Second singer</label>
        <select id="stageSingerTwo" style="display:block;width:100%;padding:10px;margin:7px 0">
          <option value="">Select second singer</option>
        </select>
      </div>

      <button id="makeStageButton" style="margin-top:10px">
        MAKE SINGER(S) MAIN STAGE
      </button>
    </div>

    <h3>⭐ Main Stage</h3>
    <div id="mainStage"
      style="background:#181818;padding:12px;border-radius:10px;min-height:100px">
      Waiting for the host to select a singer...
    </div>

    <h3>🎤 Connected Singers</h3>
    <div id="singerGrid"
      style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
    </div>
  `;

  const livekitArea = $("livekitArea");

  if (livekitArea) {
    livekitArea.appendChild(panel);
  } else {
    document.body.appendChild(panel);
  }

  $("joinLiveButton").addEventListener("click", joinAuditorium);
  $("micButton").addEventListener("click", toggleMicrophone);
  $("monitorButton").addEventListener("click", toggleMonitor);
  $("cameraButton").addEventListener("click", toggleCamera);
  $("leaveButton").addEventListener("click", leaveAuditorium);

  $("stageMode").addEventListener("change", () => {
    $("secondSingerArea").style.display =
      $("stageMode").value === "duet" ? "block" : "none";
    updateSingerOptions();
  });

  $("makeStageButton").addEventListener("click", selectMainSingers);

  bindSlider("echoSlider", "echoValue", value => audioEffects?.setEcho(value));
  bindSlider("reverbSlider", "reverbValue", value => audioEffects?.setReverb(value));
  bindSlider("mixSlider", "mixValue", value => audioEffects?.setMix(value));
  bindSlider("volumeSlider", "volumeValue", value => audioEffects?.setVolume(value));
  bindSlider("monitorVolumeSlider", "monitorVolumeValue",
    value => audioEffects?.setMonitorVolume(value));
}

function bindSlider(sliderId, valueId, callback) {
  $(sliderId).addEventListener("input", event => {
    const value = Number(event.target.value);
    $(valueId).textContent = value;
    callback(value);
  });
}

function makeSingerTile(identity, name) {
  const grid = $("singerGrid");
  if (!grid) return;

  let tile = document.getElementById("singer-" + identity);

  if (!tile) {
    tile = document.createElement("div");
    tile.id = "singer-" + identity;
    tile.style.cssText = `
      background:#252525;
      padding:10px;
      border-radius:10px;
      text-align:center;
      min-width:0;
    `;
    grid.appendChild(tile);
  }

  tile.innerHTML = `
    <p style="color:#e5bd62;font-weight:bold">
      ${escapeText(name)}
    </p>
    <div class="videoBox"></div>
  `;
}

function addParticipant(identity, name) {
  participants.set(identity, { name });

  makeSingerTile(identity, name);
  updateSingerOptions();
  showMainSinger(stageSingerUids);
}

function removeParticipant(identity) {
  participants.delete(identity);

  const tile = $("singer-" + identity);
  if (tile) tile.remove();

  updateSingerOptions();
  showMainSinger(stageSingerUids);
}

function updateSingerOptions() {
  if (!isHost) return;

  const first = $("stageSingerOne");
  const second = $("stageSingerTwo");

  if (!first || !second) return;

  const connected = Object.entries(registrations).filter(([id, item]) =>
    item &&
    item.status === "Queued" &&
    participants.has(item.singerUid)
  );

  const previousFirst = first.value;
  const previousSecond = second.value;

  const options = connected.map(([id, item]) => `
    <option value="${escapeText(id)}">
      ${escapeText(item.name || "Singer")}
    </option>
  `).join("");

  first.innerHTML =
    `<option value="">Select first singer</option>` + options;

  second.innerHTML =
    `<option value="">Select second singer</option>` + options;

  if (connected.some(([id]) => id === previousFirst)) {
    first.value = previousFirst;
  }

  if (connected.some(([id]) => id === previousSecond)) {
    second.value = previousSecond;
  }
}

function showMainSinger(uids) {
  const stage = $("mainStage");
  if (!stage) return;

  stage.innerHTML = "";

  const singerList = Array.isArray(uids)
    ? uids.filter(Boolean)
    : uids ? [uids] : [];

  if (singerList.length === 0) {
    stage.textContent = "Waiting for the host to select a singer...";
    return;
  }

  stage.style.display = "grid";
  stage.style.gridTemplateColumns =
    `repeat(${Math.min(singerList.length, 2)},minmax(0,1fr))`;
  stage.style.gap = "12px";

  singerList.forEach(uid => {
    const singerBox = document.createElement("div");
    singerBox.style.cssText = `
      background:#252525;
      padding:10px;
      border-radius:10px;
      text-align:center;
      min-width:0;
    `;

    const heading = document.createElement("p");
    heading.textContent = "⭐ " + displayName(uid);
    heading.style.cssText = "color:#e5bd62;font-weight:bold";

    singerBox.appendChild(heading);

    const participant = participants.get(uid);
    const videoBox = document.createElement("div");

    if (!participant) {
      videoBox.textContent = "Singer is not connected yet.";
    } else if (participant.videoTrack) {
      const video = participant.videoTrack.attach();
      video.autoplay = true;
      video.playsInline = true;
      video.style.cssText =
        "width:100%;max-height:450px;object-fit:contain";
      videoBox.appendChild(video);
    } else {
      videoBox.textContent = "Singer is on stage. Camera is off.";
    }

    singerBox.appendChild(videoBox);
    stage.appendChild(singerBox);
  });
}

async function selectMainSingers() {
  if (!isHost || !showId) return;

  const mode = $("stageMode").value;
  const firstId = $("stageSingerOne").value;
  const secondId = $("stageSingerTwo").value;

  if (!firstId) {
    alert("Please select the first singer.");
    return;
  }

  if (mode === "duet" && !secondId) {
    alert("Please select the second singer.");
    return;
  }

  if (mode === "duet" && firstId === secondId) {
    alert("Please select two different singers.");
    return;
  }

  const selectedIds = mode === "duet"
    ? [firstId, secondId]
    : [firstId];

  const selected = selectedIds.map(id => registrations[id]);

  if (selected.some(item => !item || !participants.has(item.singerUid))) {
    alert("Both selected singers must be connected to the auditorium.");
    return;
  }

  const singerUids = selected.map(item => item.singerUid);
  const singerNames = selected.map(item => item.name || "Singer");

  try {
    await set(ref(db, `liveStage/${showId}`), {
      mode,
      registrationIds: selectedIds,
      singerUids,
      singerNames,

      // Legacy fields for older single-singer readers
      registrationId: selectedIds[0],
      singerUid: singerUids[0],
      singerName: singerNames[0],

      updatedAt: Date.now()
    });

    setStatus(
      mode === "duet"
        ? "Duet selected for the main stage."
        : "Singer selected for the main stage."
    );
  } catch (error) {
    console.error(error);
    alert("Could not update the main stage. Please try again.");
  }
}

function listenToStage() {
  if (stopStageListener) stopStageListener();

  stopStageListener = onValue(
    ref(db, `liveStage/${showId}`),
    snapshot => {
      const stageData = snapshot.val();

      if (!stageData) {
        stageSingerUids = [];
        stageSingerNames = [];
        showMainSinger([]);
        return;
      }

      stageSingerUids = Array.isArray(stageData.singerUids)
        ? stageData.singerUids.filter(Boolean)
        : stageData.singerUid
          ? [stageData.singerUid]
          : [];

      stageSingerNames = Array.isArray(stageData.singerNames)
        ? stageData.singerNames
        : stageData.singerName
          ? [stageData.singerName]
          : [];

      showMainSinger(stageSingerUids);

      if (currentUser && !isHost &&
          !stageSingerUids.includes(currentUser.uid)) {
        if (localMic) localMic.mute().catch(console.error);
        updateMicButton();
      }

      if (currentUser && stageSingerUids.includes(currentUser.uid)) {
        setStatus("You are selected for the main stage. Unmute your mic when ready.");
      }
    },
    error => {
      console.error("Stage listener error:", error);
    }
  );
}

function listenToHostQueue() {
  if (stopQueueListener) stopQueueListener();

  stopQueueListener = onValue(
    ref(db, `showRegistrations/${showId}`),
    snapshot => {
      registrations = snapshot.val() || {};
      updateSingerOptions();
    },
    error => {
      console.error("Queue listener error:", error);
    }
  );
}

async function initializeShow() {
  try {
    if (!showId) {
      setStatus("Show ID is missing from the auditorium link.");
      return;
    }

    currentUser = await waitForUser();

    const snapshot = await get(ref(db, `shows/${showId}`));

    if (!snapshot.exists()) {
      setStatus("This show could not be found.");
      return;
    }

    currentShow = snapshot.val();

    if (currentShow.status !== "Published") {
      setStatus("This show is not currently published.");
      return;
    }

    isHost = currentShow.hostUid === currentUser.uid;

    if (isHost) {
      $("hostStageControls").style.display = "block";
      listenToHostQueue();
    }

    listenToStage();

    setStatus(
      isHost
        ? "Host connected. Select queued singers for the stage."
        : "Show loaded. Join the live auditorium when ready."
    );

  } catch (error) {
    console.error("Show initialization error:", error);
    setStatus(error.message || "Could not load the show.");
  }
}

function updateMicButton() {
  if (!localMic) return;

  $("micButton").textContent =
    localMic.isMuted ? "Unmute Mic" : "Mute Mic";
}

function updateMonitorButton(enabled) {
  $("monitorButton").textContent =
    enabled ? "Monitor My Voice ON" : "Monitor My Voice OFF";
}

function updateCameraButton() {
  if (!localCamera) return;

  $("cameraButton").textContent =
    localCamera.isMuted ? "Turn Camera On" : "Turn Camera Off";
}

async function joinAuditorium() {
  if (room) {
    setStatus("You are already connected.");
    return;
  }

  try {
    currentUser = await waitForUser();

    const singerName =
      $("liveSingerName").value.trim() || "Singer";

    $("joinLiveButton").disabled = true;
    setStatus("Connecting to the live auditorium...");

    const tokenResponse = await fetch(TOKEN_SERVER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        room: `melody-show-${showId}`,
        identity: currentUser.uid,
        name: singerName
      })
    });

    if (!tokenResponse.ok) {
      throw new Error("Could not get the LiveKit access token.");
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.token) {
      throw new Error("The token server did not return a token.");
    }

    room = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    room.on(RoomEvent.ParticipantConnected, participant => {
      addParticipant(
        participant.identity,
        participant.name || participant.identity
      );
    });

    room.on(RoomEvent.ParticipantDisconnected, participant => {
      removeParticipant(participant.identity);
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === "audio") {
        const audioElement = track.attach();
        audioElement.autoplay = true;
        audioElement.dataset.livekitRemote = "true";
        document.body.appendChild(audioElement);
      }

      if (track.kind === "video") {
        const tile = $("singer-" + participant.identity);
        if (tile) {
          const videoBox = tile.querySelector(".videoBox");
          const video = track.attach();
          video.autoplay = true;
          video.playsInline = true;
          video.style.cssText =
            "width:100%;max-height:220px;object-fit:contain";

          videoBox.replaceChildren(video);
        }

        if (stageSingerUids.includes(participant.identity)) {
          showMainSinger(stageSingerUids);
        }
      }

      participants.set(participant.identity, {
        ...participants.get(participant.identity),
        name: participant.name || participant.identity,
        videoTrack: track.kind === "video"
          ? track
          : participants.get(participant.identity)?.videoTrack
      });
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      track.detach().forEach(element => element.remove());

      if (track.kind === "video") {
        const existing = participants.get(participant.identity);

        if (existing) {
          existing.videoTrack = null;
        }

        if (stageSingerUids.includes(participant.identity)) {
          showMainSinger(stageSingerUids);
        }
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      setStatus("Disconnected from the auditorium.");
    });

    await room.connect(LIVEKIT_URL, tokenData.token);

    room.localParticipant.identity = currentUser.uid;

    addParticipant(currentUser.uid, singerName);

    // Create microphone input
    localMic = await createLocalAudioTrack({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    });

    // Process microphone audio
    audioEffects = new VirtualAudioEffects();
    processedMicTrack = await audioEffects.start(localMic.mediaStreamTrack);

    await room.localParticipant.publishTrack(processedMicTrack, {
      name: "processed-microphone"
    });

    // Everyone joins muted. Host and selected singers may unmute.
    await localMic.mute();

    // Start camera
    try {
      localCamera = await createLocalVideoTrack({
        facingMode: "user"
      });

      await room.localParticipant.publishTrack(localCamera);

      const localTile = $("singer-" + currentUser.uid);
      if (localTile) {
        const videoBox = localTile.querySelector(".videoBox");
        const video = localCamera.attach();
        video.autoplay = true;
        video.playsInline = true;
        video.style.cssText =
          "width:100%;max-height:220px;object-fit:contain";
        videoBox.replaceChildren(video);
      }

    } catch (cameraError) {
      console.warn("Camera unavailable:", cameraError);
    }

    $("joinLiveButton").disabled = true;
    $("micButton").disabled = false;
    $("monitorButton").disabled = false;
    $("cameraButton").disabled = !localCamera;
    $("leaveButton").disabled = false;

    updateMicButton();
    updateCameraButton();
    updateMonitorButton(false);

    showMainSinger(stageSingerUids);

    setStatus(
      "Connected. Your microphone is muted. The host can select singers for the stage."
    );

  } catch (error) {
    console.error("Join auditorium error:", error);
    await leaveAuditorium();
    setStatus(error.message || "Could not join the auditorium.");
  }
}

async function toggleMicrophone() {
  if (!localMic || !currentUser) return;

  const allowedToSpeak =
    isHost || stageSingerUids.includes(currentUser.uid);

  if (localMic.isMuted && !allowedToSpeak) {
    alert("Only the host or a singer selected for the main stage can unmute.");
    return;
  }

  try {
    if (localMic.isMuted) {
      await localMic.unmute();
    } else {
      await localMic.mute();
    }

    updateMicButton();
  } catch (error) {
    console.error("Microphone error:", error);
    setStatus("Could not change microphone state.");
  }
}

async function toggleMonitor() {
  if (!audioEffects) return;

  try {
    const enabled = !audioEffects.monitorEnabled;
    await audioEffects.setMonitor(enabled);
    updateMonitorButton(enabled);
  } catch (error) {
    console.error("Monitor error:", error);
    setStatus("Could not change headphone monitoring.");
  }
}

async function toggleCamera() {
  if (!localCamera) return;

  try {
    if (localCamera.isMuted) {
      await localCamera.unmute();
    } else {
      await localCamera.mute();
    }

    updateCameraButton();
  } catch (error) {
    console.error("Camera toggle error:", error);
  }
}

async function leaveAuditorium() {
  try {
    if (localMic) {
      localMic.stop();
      localMic = null;
    }

    if (localCamera) {
      localCamera.stop();
      localCamera = null;
    }

    if (audioEffects) {
      audioEffects.stop();
      audioEffects = null;
    }

    processedMicTrack = null;

    if (room) {
      await room.disconnect();
      room = null;
    }

    document
      .querySelectorAll('audio[data-livekit-remote="true"]')
      .forEach(element => element.remove());

    participants.clear();

    if ($("singerGrid")) {
      $("singerGrid").innerHTML = "";
    }

    $("joinLiveButton").disabled = false;
    $("micButton").disabled = true;
    $("monitorButton").disabled = true;
    $("cameraButton").disabled = true;
    $("leaveButton").disabled = true;

    $("micButton").textContent = "Unmute Mic";
    $("cameraButton").textContent = "Turn Camera Off";
    updateMonitorButton(false);

    setStatus("You have left the live auditorium.");

    showMainSinger(stageSingerUids);

  } catch (error) {
    console.error("Leave auditorium error:", error);
    setStatus("There was a problem leaving the auditorium.");
  }
}

createPanel();
initializeShow();
