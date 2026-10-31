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
};
connectAuditorium()
  .then(async (user) => {
    await set(
      ref(db, "registrations/" + user.uid + "/connectionTest"),
      "Database working"
    );

    alert("Success! Firebase login and database are working.");
  })
  .catch((error) => {
    alert("Firebase error: " + error.message);
  });