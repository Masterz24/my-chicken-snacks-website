import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { subscribeOrders } from "./order-store.js";

const activeList = document.getElementById("activeOrdersList");
const trackingModal = document.getElementById("trackingModal");
const trackingModalContent = document.getElementById("trackingModalContent");
const closeTrackingModal = document.getElementById("closeTrackingModal");

let unsubscribeOrders = null;
let latestOrders = [];

const STEPS = [
  { key: "accepted", label: "Accepted", icon: "✓" },
  { key: "preparing", label: "Preparing", icon: "▣" },
  { key: "out_for_delivery", label: "Out for delivery", icon: "⌖" },
  { key: "delivered", label: "Delivered", icon: "✓" }
];

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[ch]));
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeStatus(order) {
  const status = String(order?.status || "new").toLowerCase();
  if (status === "ready") return "out_for_delivery";
  if (status === "order placed ✓" || status === "order placed") return "new";
  return status;
}

function statusIndex(status) {
  const index = STEPS.findIndex(step => step.key === status);
  return index;
}

function statusText(status) {
  if (status === "new") return "Order placed · waiting for acceptance";
  const step = STEPS.find(item => item.key === status);
  return step?.label || "Order update";
}

function statusTime(order, key) {
  const field = {
    accepted: "acceptedAt",
    preparing: "preparingAt",
    out_for_delivery: "outForDeliveryAt",
    delivered: "deliveredAt"
  }[key];
  return order?.[field] || null;
}

function timelineHtml(order, compact = false) {
  const status = normalizeStatus(order);
  const currentIndex = statusIndex(status);

  return `<div class="order-timeline ${compact ? "compact" : ""}" aria-label="Order progress">
    ${STEPS.map((step, index) => {
      const completed = currentIndex >= index;
      const current = currentIndex === index;
      const time = statusTime(order, step.key);
      return `<div class="timeline-step ${completed ? "completed" : ""} ${current ? "current" : ""}">
        <div class="timeline-rail"></div>
        <div class="timeline-dot">${completed ? step.icon : ""}</div>
        <div class="timeline-copy">
          <strong>${step.label}</strong>
          <small>${time ? escapeHtml(formatDate(time)) : current ? "In progress" : index < currentIndex ? "" : ""}</small>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

function orderItems(order) {
  if (Array.isArray(order.cartItems) && order.cartItems.length) {
    return order.cartItems.map(item => `${item.name || "Item"} × ${Number(item.quantity || 1)}`).join(", ");
  }
  return String(order.items || "Chicken GRAY + Snacks");
}

function activeOrders(orders) {
  return orders.filter(order => {
    const status = normalizeStatus(order);
    return ["new", "accepted", "preparing", "out_for_delivery"].includes(status);
  });
}

function renderActiveOrders() {
  if (!activeList) return;

  const orders = activeOrders(latestOrders);
  if (!orders.length) {
    activeList.innerHTML = `
      <div class="tracking-empty">
        <div class="empty-icon">⌖</div>
        <h3>No active orders</h3>
        <p>New orders will appear here immediately after checkout. When an order is Delivered, it automatically moves to Order history.</p>
        <a href="index.html#menu" class="account-action">Explore menu</a>
      </div>`;
    return;
  }

  activeList.innerHTML = orders.map(order => {
    const status = normalizeStatus(order);
    const currentIndex = statusIndex(status);
    const total = Number(order.total || order.totalAmount || 0);
    return `<article class="tracking-card" data-tracking-order="${escapeHtml(order.id)}">
      <div class="tracking-card-head">
        <div class="tracking-order-identity">
          <div class="order-icon">${escapeHtml(order.emoji || "🍗")}</div>
          <div>
            <span class="tracking-kicker">ORDER #${escapeHtml(order.id)}</span>
            <h3>${escapeHtml(order.name || "Chicken GRAY order")}</h3>
            <p>${escapeHtml(order.date || formatDate(order.createdAt))}</p>
          </div>
        </div>
        <div class="tracking-live-status ${status === "new" ? "waiting" : ""}">
          <span class="tracking-live-dot"></span>
          ${escapeHtml(statusText(status))}
        </div>
      </div>

      <div class="tracking-summary">
        <div><span>Items</span><strong>${escapeHtml(orderItems(order))}</strong></div>
        <div><span>Delivery</span><strong>${escapeHtml(order.addressLabel || "Other")}</strong></div>
        <div><span>Total</span><strong>₹${total.toLocaleString("en-IN")}</strong></div>
      </div>

      <div class="tracking-current-message">
        <strong>${status === "new" ? "We have received your order." : `${escapeHtml(statusText(status))}`}</strong>
        <span>${status === "new" ? "The restaurant will accept it shortly." : currentIndex === 2 ? "Your order is on the way to you." : "Your order is moving through the restaurant workflow."}</span>
      </div>

      ${timelineHtml(order, true)}

      <div class="tracking-card-actions">
        <button type="button" class="order-action" data-open-tracking="${escapeHtml(order.id)}">TRACK ORDER</button>
        <button type="button" class="order-action secondary" data-help-order="${escapeHtml(order.id)}">HELP</button>
      </div>
    </article>`;
  }).join("");
}

function renderTrackingModal(order) {
  if (!trackingModal || !trackingModalContent || !order) return;
  const status = normalizeStatus(order);
  const total = Number(order.total || order.totalAmount || 0);

  trackingModalContent.innerHTML = `
    <div class="tracking-modal-order">
      <div class="tracking-modal-title-row">
        <div>
          <span class="tracking-kicker">ORDER #${escapeHtml(order.id)}</span>
          <h3>${escapeHtml(order.name || "Chicken GRAY order")}</h3>
        </div>
        <span class="tracking-status-pill">${escapeHtml(statusText(status))}</span>
      </div>
      <div class="tracking-route-visual" aria-hidden="true">
        <div class="tracking-route-line"></div>
        <div class="tracking-route-point start">●</div>
        <div class="tracking-route-point end">⌖</div>
        <span class="tracking-route-label restaurant">Chicken GRAY</span>
        <span class="tracking-route-label customer">Delivery address</span>
      </div>
      <div class="tracking-modal-info">
        <div><span>Placed</span><strong>${escapeHtml(order.date || formatDate(order.createdAt))}</strong></div>
        <div><span>Delivery</span><strong>${escapeHtml(order.addressLabel || "Other")}</strong></div>
        <div><span>Total</span><strong>₹${total.toLocaleString("en-IN")}</strong></div>
      </div>
      ${timelineHtml(order)}
      <div class="tracking-modal-note">
        <strong>${status === "new" ? "Waiting for restaurant acceptance" : escapeHtml(statusText(status))}</strong>
        <span>Status changes are synced live from the restaurant dashboard.</span>
      </div>
    </div>`;

  trackingModal.classList.add("open");
  trackingModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("tracking-modal-open");
}

function closeModal() {
  if (!trackingModal) return;
  trackingModal.classList.remove("open");
  trackingModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tracking-modal-open");
}

function findOrder(id) {
  return latestOrders.find(order => order.id === id);
}

activeList?.addEventListener("click", event => {
  const track = event.target.closest("[data-open-tracking]");
  if (track) {
    const order = findOrder(track.dataset.openTracking);
    if (order) renderTrackingModal(order);
    return;
  }

  const help = event.target.closest("[data-help-order]");
  if (help) {
    document.getElementById("orderHelpModal")?.classList.add("open");
    document.getElementById("orderHelpModal")?.setAttribute("aria-hidden", "false");
  }
});

closeTrackingModal?.addEventListener("click", closeModal);
trackingModal?.addEventListener("click", event => {
  if (event.target === trackingModal) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
});

onAuthStateChanged(auth, user => {
  if (unsubscribeOrders) {
    unsubscribeOrders();
    unsubscribeOrders = null;
  }

  if (!user) {
    latestOrders = [];
    renderActiveOrders();
    return;
  }

  unsubscribeOrders = subscribeOrders(
    user,
    orders => {
      const previouslyDelivered = new Set(
        latestOrders.filter(order => normalizeStatus(order) === "delivered").map(order => order.id)
      );

      latestOrders = orders;
      renderActiveOrders();

      // Delivered orders move to history without a manual refresh.
      const newlyDelivered = orders.some(order =>
        normalizeStatus(order) === "delivered" && !previouslyDelivered.has(order.id)
      );
      if (newlyDelivered) window.__refreshOrderHistory?.();
    },
    error => {
      console.error("Firebase live order status failed:", error);
      if (activeList) {
        activeList.innerHTML = `<div class="tracking-empty"><div class="empty-icon">⚠️</div><h3>Could not load live order status</h3><p>${escapeHtml(error?.message || "Please check your Firebase connection and Firestore rules.")}</p></div>`;
      }
    }
  );
});
