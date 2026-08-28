// js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHkdNjYb_HD078N_KkBGUbCJhqc448njQ",
  authDomain: "chicken-gray-snacks.firebaseapp.com",
  projectId: "chicken-gray-snacks",
  storageBucket: "chicken-gray-snacks.firebasestorage.app",
  messagingSenderId: "214695833726",
  appId: "1:214695833726:web:f6d37f265e76132043682f",
  measurementId: "G-HQVGKZM1CG"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Keep the customer signed in across mobile browser restarts.
// This is explicit instead of relying on browser defaults.
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn("Firebase local auth persistence could not be enabled:", error);
});
export const db = getFirestore(app);
