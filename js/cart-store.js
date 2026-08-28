import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const CART_DOC = "current";

function cartRef(user) {
  if (!user) throw new Error("AUTH_REQUIRED");
  return doc(db, "users", user.uid, "cart", CART_DOC);
}

export async function getCart(user) {
  const snap = await getDoc(cartRef(user));
  if (!snap.exists()) return [];
  const items = snap.data()?.items;
  return Array.isArray(items) ? items : [];
}

export async function saveCart(user, items) {
  const clean = Array.isArray(items) ? items : [];
  if (!clean.length) {
    await clearCart(user);
    return [];
  }
  await setDoc(cartRef(user), {
    items: clean,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  return clean;
}

export async function clearCart(user) {
  await deleteDoc(cartRef(user));
}
