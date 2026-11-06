
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

// FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyDpdxSCppxHTjzE1sNMHHGQ2DbZm-Mq-lk",
  authDomain: "melody-magic-auditorium.firebaseapp.com",
  databaseURL: "https://melody-magic-auditorium-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "melody-magic-auditorium",
  storageBucket: "melody-magic-auditorium.firebasestorage.app",
  messagingSenderId: "458186749712",
  appId: "1:458186749712:web:311ecbed0c87367022d795"
};

// INITIALIZE FIREBASE
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// ANONYMOUS AUDITORIUM CONNECTION
async function connectAuditorium() {
  const result = await signInAnonymously(auth);
  return result.user;
}

// SINGER REGISTRATION
async function registerSinger(
  name,
  song,
  language,
  sessionId = "",
  performance = ""
) {
  const user = await connectAuditorium();

  const registrationRef = push(
    ref(db, "registrations/" + user.uid)
  );

  await set(registrationRef, {
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

// LISTEN TO SINGERS
function listenToSingers(callback) {
  return onValue(
    ref(db, "registrations"),
    (snapshot) => {
      callback(snapshot.val() || {});
    }
  );
}

// HOST REGISTRATION
async function registerHost(
  name,
  email,
  mobile,
  plan,
  password
) {
  const result = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  const user = result.user;

  await set(
    ref(db, "hostApplications/" + user.uid),
    {
      name,
      email,
      mobile,
      plan,
      status: "Pending",
      createdAt: Date.now()
    }
  );

  return user;
}

// HOST LOGIN
async function hostLogin(email, password) {
  const result = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return result.user;
}

// HOST LOGOUT
async function hostLogout() {
  await signOut(auth);
}

// CHECK LOGIN STATUS
function checkLogin(callback) {
  return onAuthStateChanged(auth, callback);
}

// EXPORT ALL REQUIRED FUNCTIONS
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
