import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

export async function getSavedAddresses(user) {
  if (!user) return [];

  const snap = await getDocs(collection(db, "users", user.uid, "addresses"));
  return snap.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
}

export async function createAddress(user, data) {
  if (!user) throw new Error("AUTH_REQUIRED");

  const clean = normalizeAddress(data);
  try {
    const ref = await addDoc(collection(db, "users", user.uid, "addresses"), {
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { id: ref.id, ...clean };
  } catch (error) {
    console.error("Firestore createAddress failed:", {
      code: error?.code,
      message: error?.message,
      uid: user?.uid,
      projectId: db?.app?.options?.projectId
    });
    throw error;
  }
}

export async function updateAddress(user, id, data) {
  if (!user) throw new Error("AUTH_REQUIRED");

  const clean = normalizeAddress(data);
  try {
    await updateDoc(doc(db, "users", user.uid, "addresses", id), {
      ...clean,
      updatedAt: serverTimestamp()
    });
    return { id, ...clean };
  } catch (error) {
    console.error("Firestore updateAddress failed:", {
      code: error?.code,
      message: error?.message,
      uid: user?.uid,
      addressId: id,
      projectId: db?.app?.options?.projectId
    });
    throw error;
  }
}

export async function removeAddress(user, id) {
  if (!user) throw new Error("AUTH_REQUIRED");
  await deleteDoc(doc(db, "users", user.uid, "addresses", id));
}

export function normalizeAddress(data) {
  const label = String(data.label || "Other").trim();
  const fullAddress = String(data.fullAddress || "").trim();
  const latitude = data.latitude == null || data.latitude === "" ? null : Number(data.latitude);
  const longitude = data.longitude == null || data.longitude === "" ? null : Number(data.longitude);
  const accuracy = data.accuracy == null || data.accuracy === "" ? null : Number(data.accuracy);

  // Prefer the saved GPS point because it is the exact delivery destination.
  // Keep a text-address fallback for older/manual addresses.
  // Always prefer the exact saved GPS point when one exists. This prevents
  // an older text-address map link from replacing the precise destination.
  const locationLink = String(
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
      : data.locationLink ||
        (fullAddress
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
          : "")
  ).trim();

  return {
    label,
    door: String(data.door || "").trim(),
    area: String(data.area || "").trim(),
    landmark: String(data.landmark || "").trim(),
    mobile: String(data.mobile || "").replace(/\D/g, "").slice(0, 10),
    receiverName: String(data.receiverName || "").trim(),
    receiverNumber: String(data.receiverNumber || "").replace(/\D/g, "").slice(0, 10),
    fullAddress,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    locationLink
  };
}
