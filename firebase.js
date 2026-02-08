import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCrZb-G8Cvk2mUDFWabC4FrWszCUK47xaw",
  authDomain: "connect4-e2ad8.firebaseapp.com",
  projectId: "connect4-e2ad8",
  storageBucket: "connect4-e2ad8.firebasestorage.app",
  messagingSenderId: "763431725125",
  appId: "1:763431725125:web:956d260fb6a2eccd471b2c",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
auth.languageCode = "en";

const observeAuthState = (callback) => onAuthStateChanged(auth, callback);

const createRecaptchaVerifier = (containerId) =>
  new RecaptchaVerifier(auth, containerId, {
    size: "normal",
  });

const sendPhoneOtp = (phoneNumber, recaptchaVerifier) =>
  signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);

const signOutUser = () => signOut(auth);

export {
  db,
  auth,
  observeAuthState,
  createRecaptchaVerifier,
  sendPhoneOtp,
  signOutUser,
};
