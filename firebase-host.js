
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getDatabase,
  ref,
  set
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpdxSCppxHTjzE1sNMHHGQ2DbZm-Mq-lk",
  authDomain: "melody-magic-auditorium.firebaseapp.com",
  databaseURL: "https://melody-magic-auditorium-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "melody-magic-auditorium",
  appId: "1:458186749712:web:311ecbed0c87367022d795"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getDatabase(app);
export const auth = getAuth(app);

export async function registerHost(name, email, mobile, plan, password) {
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

export async function hostLogin(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function hostLogout() {
  return signOut(auth);
}

export function checkLogin(callback) {
  return onAuthStateChanged(auth, callback);
}
