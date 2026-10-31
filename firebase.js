import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// Replace these example values with your Firebase web configuration
const firebaseConfig = {
  apiKey: "AIzaSyDpdxSCppxHTjzE1sNMHHGQ2DbZm-Mq-lk",
  authDomain: "melody-magic-auditorium.firebaseapp.com",
  databaseURL: "https://melody-magic-auditorium-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "melody-magic-auditorium",
  appId: "1:458186749712:web:311ecbed0c87367022d795"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

async function connectAuditorium() {
  const result = await signInAnonymously(auth);
  return result.user;
}

async function registerSinger(name, song, language) {
  const user = await connectAuditorium();

  await set(ref(db, "registrations/" + user.uid), {
    name,
    song,
    language,
    status: "Waiting",
    createdAt: Date.now()
  });

  return user.uid;
}

function listenToSingers(callback) {
  onValue(ref(db, "registrations"), (snapshot) => {
    callback(snapshot.val() || {});
  });
}

export {
  registerSinger,
  listenToSingers,
  connectAuditorium
connectAuditorium()
  .then((user) => {
    const status = document.createElement("div");
    status.textContent =
      "Connected to Melody Magic! User ID: " + user.uid;

    status.style.cssText =
      "position:fixed;bottom:10px;left:10px;right:10px;" +
      "background:#176b36;color:white;padding:15px;" +
      "z-index:99999;border-radius:10px;text-align:center;";

    document.body.appendChild(status);
  })
  .catch((error) => {
    alert("Firebase connection error: " + error.message);
  });
