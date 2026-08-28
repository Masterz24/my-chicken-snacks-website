import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const RESTAURANT_ID = "chicken-gray-snacks";

function normalizeOrder(id, data) {
  const rawStatus = String(data?.status || "new").toLowerCase();
  // "ready" existed in the previous dashboard build. Treat it as the
  // equivalent of the new customer-facing "out_for_delivery" stage.
  const status = rawStatus === "ready" ? "out_for_delivery" : rawStatus;
  return {
    id,
    ...data,
    status
  };
}

function sortOrders(orders) {
  return orders.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
}

export async function getOrders(user) {
  if (!user) throw new Error("AUTH_REQUIRED");

  const [customerSnap, restaurantSnap] = await Promise.all([
    getDocs(collection(db, "users", user.uid, "orders")),
    getDocs(query(
      collection(db, "restaurants", RESTAURANT_ID, "orders"),
      where("customerUid", "==", user.uid)
    ))
  ]);

  return mergeOrderCopies(
    user,
    customerSnap.docs.map(item => normalizeOrder(item.id, item.data())),
    restaurantSnap.docs.map(item => normalizeOrder(item.id, item.data()))
  );
}

function mergeOrderCopies(user, customerOrders, restaurantOrders) {
  const merged = new Map(customerOrders.map(order => [order.id, order]));

  // Restaurant order status is the operational source of truth. Merge its
  // workflow fields into the customer copy so tracking remains live even if
  // an older/legacy customer document could not be mirrored by the owner.
  restaurantOrders.forEach(restaurantOrder => {
    const customerOrder = merged.get(restaurantOrder.id);
    merged.set(restaurantOrder.id, customerOrder
      ? { ...customerOrder, ...restaurantOrder }
      : restaurantOrder);
  });

  return sortOrders([...merged.values()]);
}

/**
 * Realtime customer order feed. The customer app listens to both its private
 * order copy and the restaurant order feed filtered by customerUid. This makes
 * restaurant status changes immediately visible in Order status without mixing
 * customer authentication with the owner console.
 */
export function subscribeOrders(user, onChange, onError) {
  if (!user) throw new Error("AUTH_REQUIRED");

  let customerOrders = [];
  let restaurantOrders = [];
  let customerReady = false;
  let restaurantReady = false;

  const emit = () => {
    if (!customerReady && !restaurantReady) return;
    onChange?.(mergeOrderCopies(
      user,
      customerOrders,
      restaurantOrders
    ));
  };

  // Private customer copy.
  const unsubscribeCustomer = onSnapshot(
    collection(db, "users", user.uid, "orders"),
    snap => {
      customerReady = true;
      customerOrders = snap.docs.map(item =>
        normalizeOrder(item.id, item.data())
      );
      emit();
    },
    error => onError?.(error)
  );

  // Restaurant operational copy.
  //
  // IMPORTANT:
  // Listen directly to the restaurant feed for this customer. This means
  // Accepted / Preparing / Out for delivery / Delivered changes remain
  // visible even if an older customer-side order copy is missing.
  //
  // Firestore rules still enforce that the signed-in customer can only read
  // restaurant orders whose customerUid matches request.auth.uid.
  const restaurantQuery = query(
    collection(db, "restaurants", RESTAURANT_ID, "orders"),
    where("customerUid", "==", user.uid)
  );

  const unsubscribeRestaurant = onSnapshot(
    restaurantQuery,
    snap => {
      restaurantReady = true;
      restaurantOrders = snap.docs.map(item =>
        normalizeOrder(item.id, item.data())
      );
      emit();
    },
    error => onError?.(error)
  );

  return () => {
    unsubscribeCustomer();
    unsubscribeRestaurant();
  };
}

export async function saveOrder(user, orderId, order) {
  if (!user) throw new Error("AUTH_REQUIRED");

  const batch = writeBatch(db);
  const timestamp = serverTimestamp();
  const status = String(order.status || "new").toLowerCase();

  const orderData = {
    ...order,
    restaurantId: RESTAURANT_ID,
    customerUid: user.uid,
    customerEmail: order.customerEmail || user.email || "",
    status,
    delivered: false,
    accepted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    statusUpdatedAt: timestamp
  };

  // Customer copy.
  batch.set(
    doc(db, "users", user.uid, "orders", orderId),
    orderData
  );

  // Restaurant copy. Both documents are committed atomically so the owner
  // dashboard cannot receive a partial order.
  batch.set(
    doc(db, "restaurants", RESTAURANT_ID, "orders", orderId),
    orderData
  );

  await batch.commit();
}

export async function deleteOrder(user, orderId) {
  if (!user) throw new Error("AUTH_REQUIRED");

  await deleteDoc(
    doc(db, "users", user.uid, "orders", orderId)
  );
}
