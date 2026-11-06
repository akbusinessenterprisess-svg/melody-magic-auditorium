
import { ref, get } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

import {
  getDatabase,
  ref,
  set,
  push,
  onValue
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpdxSCppxHTjzE1sNMHHGQ2DbZm-Mq-lk",
  authDomain: "melody-magic-auditorium.firebaseapp.com",
  databaseURL: "https://melody-magic-auditorium-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "melody-magic-auditorium",
  storageBucket: "melody-magic-auditorium.firebasestorage.app",
  messagingSenderId: "458186749712",
  appId: "1:458186749712:web:311ecbed0c87367022d795"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

async function connectAuditorium() {
  const result = await signInAnonymously(auth);
  return result.user;
}

async function registerSinger(name, song, language, sessionId, performance) {
  const user = await connectAuditorium();

  await set(push(ref(db, "registrations/" + user.uid)), {
    name,
    song,
    language,
    sessionId,
    performance,
    status: "Waiting",
    createdAt: Date.now()
  });

  return user.uid;
}

function listenToSingers(callback) {
  onValue(ref(db, "registrations"), snapshot => {
    callback(snapshot.val() || {});
  });
}

async function registerHost(name, email, mobile, plan, password) {
  const result = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  const user = result.user;

  await set(ref(db, "hostApplications/" + user.uid), {
    name,
    email,
    mobile,
    plan,
    status: "Pending",
    createdAt: Date.now()
  });

  return user;
}

async function hostLogin(email, password) {
  const result = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return result.user;
}

async function hostLogout() {
  await signOut(auth);
}

function checkLogin(callback) {
  return onAuthStateChanged(auth, callback);
}

export {
  db,
  auth,
  registerSinger,
  registerHost,
  listenToSingers,
  connectAuditorium,
  hostLogin,
  hostLogout,
  checkLogin
};
