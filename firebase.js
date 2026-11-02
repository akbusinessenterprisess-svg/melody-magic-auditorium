
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

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

// KEEP YOUR EXISTING FIREBASE CONFIGURATION HERE.
const firebaseConfig = {
  // AIzaSyDpdxSCppxHTjzE1sNMHHGQ2DbZm-Mq-lk, melody-magic-auditorium.firebaseapp.com, https://melody-magic-auditorium-default-rtdb.asia-southeast1.firebasedatabase.app,
  // melody-magic-auditorium and 1:458186749712:web:311ecbed0c87367022d795 values from your current firebase.js.
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Singer registration
async function registerSinger(name, mobile, song, language, showId, performance) {
  let user = auth.currentUser;

  if (!user) {
    const result = await signInAnonymously(auth);
    user = result.user;
  }

  const showSnapshot = await new Promise((resolve, reject) => {
    onValue(
      ref(db, "shows/" + showId),
      snapshot => resolve(snapshot),
      reject,
      { onlyOnce: true }
    );
  });

  if (!showSnapshot.exists() || showSnapshot.val().status !== "Published") {
    throw new Error("This show is not available for registration.");
  }

  const show = showSnapshot.val();
  const registrationRef = push(ref(db, "showRegistrations/" + showId));

  const registration = {
    singerUid: user.uid,
    name,
    mobile,
    song,
    language,
    performance,
    showId,
    showTitle: show.title || "",
    hostUid: show.hostUid || "",
    status: "Waiting",
    createdAt: Date.now()
  };

  await set(registrationRef, registration);

  return registrationRef.key;
}

// Host account functions
async function registerHost(name, email, mobile, plan, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);

  await set(ref(db, "hostApplications/" + result.user.uid), {
    name,
    email,
    mobile,
    plan,
    status: "Pending",
    createdAt: Date.now()
  });

  return result.user;
}

async function hostLogin(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

async function hostLogout() {
  await signOut(auth);
}

function checkLogin(callback) {
  return onAuthStateChanged(auth, callback);
}

function connectAuditorium() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return signInAnonymously(auth).then(result => result.user);
}

export {
  db,
  auth,
  registerSinger,
  registerHost,
  hostLogin,
  hostLogout,
  checkLogin,
  connectAuditorium
};
