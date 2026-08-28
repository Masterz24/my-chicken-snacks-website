import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getSavedAddresses } from "./address-store.js";
import { getCart, saveCart, clearCart } from "./cart-store.js";
import { saveOrder } from "./order-store.js";

const selectedAddressEl = document.getElementById("checkoutSelectedAddress");
const selectedAddressLabelEl = document.getElementById("checkoutSelectedAddressLabel");
const selectedAddressTextEl = document.getElementById("checkoutSelectedAddressText");
const paymentStep = document.getElementById("paymentStep");
const paymentOptions = document.getElementById("paymentOptions");
const paymentMessage = document.getElementById("paymentSelectedMessage");
const placeOrderWrap = document.getElementById("placeOrderWrap");
const placeOrderButton = document.getElementById("placeOrderButton");
const successModal = document.getElementById("orderSuccessModal");
const successOk = document.getElementById("orderSuccessOk");
const checkoutAddMore = document.getElementById("checkoutAddMore");
const deliveryPickerModal = document.getElementById("deliveryPickerModal");
const deliveryPickerBody = document.getElementById("deliveryPickerBody");
const deliveryPickerClose = document.getElementById("deliveryPickerClose");
const deliveryPickerSheet = document.querySelector(".delivery-picker-sheet");
const deliveryPickerError = document.getElementById("deliveryPickerError");
const deliveryPickerErrorOk = document.getElementById("deliveryPickerErrorOk");
const deliveryPickerTitle = document.getElementById("deliveryPickerTitle");

let currentUser = null;
let cart = [];
let currentAddresses = [];
let selectedAddress = null;
let selectedPayment = "";

checkoutAddMore?.addEventListener("click", () => {
  window.location.href = "index.html#menu";
});

async function updateCheckoutCart(id, delta) {
  if (!currentUser) return;
  const item = cart.find(entry => Number(entry.id) === Number(id));
  if (!item) return;

  item.quantity = Number(item.quantity || 0) + delta;
  if (item.quantity <= 0) {
    cart = cart.filter(entry => Number(entry.id) !== Number(id));
  }

  try {
    await saveCart(currentUser, cart);
    renderCart();
    if (!cart.length) {
      paymentStep.hidden = true;
      placeOrderWrap.hidden = true;
      selectedAddress = null;
      selectedPayment = "";
    }
    updatePaymentState();
  } catch (err) {
    console.error("Firebase cart update failed:", err);
    alert("Could not update your cart. Please try again.");
    cart = await getCart(currentUser);
    renderCart();
  }
}

async function removeCheckoutItem(id) {
  if (!currentUser) return;
  cart = cart.filter(entry => Number(entry.id) !== Number(id));
  try {
    await saveCart(currentUser, cart);
    renderCart();
    if (!cart.length) {
      paymentStep.hidden = true;
      placeOrderWrap.hidden = true;
      selectedAddress = null;
      selectedPayment = "";
    }
    updatePaymentState();
  } catch (err) {
    console.error("Firebase cart remove failed:", err);
    alert("Could not remove this item. Please try again.");
    cart = await getCart(currentUser);
    renderCart();
  }
}

document.getElementById("checkoutItems")?.addEventListener("click", event => {
  const minus = event.target.closest("[data-checkout-minus]");
  const plus = event.target.closest("[data-checkout-plus]");
  const remove = event.target.closest("[data-checkout-remove]");
  if (minus) updateCheckoutCart(minus.dataset.checkoutMinus, -1);
  if (plus) updateCheckoutCart(plus.dataset.checkoutPlus, 1);
  if (remove) removeCheckoutItem(remove.dataset.checkoutRemove);
});

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) {
    location.href = "login.html?redirect=checkout.html";
    return;
  }

  try {
    cart = await getCart(user);
  } catch (err) {
    console.error("Firebase cart load failed:", err);
    cart = [];
    alert("Could not load your cart from Firebase.");
  }

  if (!cart.length) {
    renderCart();
    return;
  }

  await renderAddresses(user);
  renderCart();
  if (new URLSearchParams(location.search).get("openAddress") === "1") {
    openDeliveryPicker();
  }
  setupPaymentOptions();
  updatePaymentState();
});

async function renderAddresses(user) {
  currentAddresses = await getSavedAddresses(user);

  if (!currentAddresses.length) {
    selectedAddress = null;
    paymentStep.hidden = true;
    placeOrderWrap.hidden = true;
    renderSelectedAddress();
    renderDeliveryPicker();
    openDeliveryPicker();
    return;
  }

  // No address is selected automatically. The delivery picker opens as soon
  // as the customer enters Secure Checkout so they can choose an address.
  selectedAddress = null;
  renderSelectedAddress();
  renderDeliveryPicker();
  openDeliveryPicker();
}

function renderDeliveryPicker() {
  if (!deliveryPickerBody) return;

  if (!currentAddresses.length) {
    deliveryPickerBody.innerHTML = `
      <a class="delivery-picker-add" href="address.html?return=checkout&openPicker=1">
        <span class="delivery-picker-add-icon">+</span>
        <strong>Add new Address</strong>
      </a>`;
    return;
  }

  const addressRows = currentAddresses.map(address => {
    const summary = [address.door, address.area, address.landmark, address.fullAddress]
      .filter(Boolean)
      .join(", ");
    const label = address.label || "Other";
    const isSelected = selectedAddress?.id === address.id;

    return `
      <button type="button" class="delivery-picker-address ${isSelected ? "selected" : ""}" data-picker-select="${escapeHtml(address.id)}">
        <span class="delivery-picker-address-icon">⌖</span>
        <span class="delivery-picker-address-copy">
          <strong>${escapeHtml(label)}${isSelected ? ' <em>SELECTED</em>' : ""}</strong>
          <small>${escapeHtml(summary || "Location saved")}</small>
        </span>
      </button>`;
  }).join("");

  deliveryPickerBody.innerHTML = `
    <a class="delivery-picker-add" href="address.html?return=checkout&openPicker=1">
      <span class="delivery-picker-add-icon">+</span>
      <strong>Add new Address</strong>
    </a>
    <div class="delivery-picker-divider"></div>
    <div class="delivery-picker-list">${addressRows}</div>`;

  deliveryPickerBody.querySelectorAll("[data-picker-select]").forEach(button => {
    button.addEventListener("click", () => {
      const item = currentAddresses.find(address => address.id === button.dataset.pickerSelect);
      if (!item) return;

      selectedAddress = item;
      selectedPayment = "";
      hideDeliveryPickerError();
      renderSelectedAddress();
      paymentStep.hidden = false;
      placeOrderWrap.hidden = true;
      renderDeliveryPicker();
      closeDeliveryPicker();
      updatePaymentState();
    });
  });
}

function openDeliveryPicker() {
  if (!deliveryPickerModal) return;
  hideDeliveryPickerError();
  deliveryPickerModal.classList.add("open");
  deliveryPickerModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("delivery-picker-open");
}

function closeDeliveryPicker() {
  if (!deliveryPickerModal) return;
  // A delivery address must be selected before this picker can be dismissed.
  if (!selectedAddress) {
    showDeliveryPickerError();
    return;
  }
  deliveryPickerModal.classList.remove("open");
  deliveryPickerModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("delivery-picker-open");
}

function showDeliveryPickerError() {
  if (!deliveryPickerModal) return;
  deliveryPickerModal.classList.add("open");
  deliveryPickerModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("delivery-picker-open");
  deliveryPickerError?.classList.add("show");
  deliveryPickerError?.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => deliveryPickerErrorOk?.focus());
}

function hideDeliveryPickerError() {
  deliveryPickerError?.classList.remove("show");
  deliveryPickerError?.setAttribute("aria-hidden", "true");
}

deliveryPickerClose?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  if (selectedAddress) {
    closeDeliveryPicker();
  } else {
    showDeliveryPickerError();
  }
});

deliveryPickerErrorOk?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  hideDeliveryPickerError();
  deliveryPickerTitle?.focus();
  deliveryPickerSheet?.scrollTo({ top: 0, behavior: "smooth" });
});

deliveryPickerModal?.addEventListener("click", event => {
  if (event.target === deliveryPickerModal) {
    if (selectedAddress) {
      closeDeliveryPicker();
    } else {
      showDeliveryPickerError();
    }
    return;
  }

  if (!deliveryPickerSheet || !deliveryPickerSheet.contains(event.target)) return;

  const allowed = event.target.closest("[data-picker-select], .delivery-picker-add, #deliveryPickerClose, #deliveryPickerErrorOk");
  if (!allowed) {
    if (selectedAddress) {
      closeDeliveryPicker();
    } else {
      showDeliveryPickerError();
    }
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !deliveryPickerModal?.classList.contains("open")) return;

  event.preventDefault();
  if (selectedAddress) {
    closeDeliveryPicker();
  } else {
    showDeliveryPickerError();
  }
});

function renderSelectedAddress() {
  if (!selectedAddressEl) return;

  if (!selectedAddress) {
    selectedAddressEl.hidden = true;
    if (selectedAddressLabelEl) selectedAddressLabelEl.textContent = "Delivery address";
    if (selectedAddressTextEl) selectedAddressTextEl.textContent = "";
    return;
  }

  const summary = [selectedAddress.door, selectedAddress.area, selectedAddress.landmark, selectedAddress.fullAddress]
    .filter(Boolean)
    .join(", ");

  if (selectedAddressLabelEl) {
    selectedAddressLabelEl.textContent = selectedAddress.label || "Other";
  }
  if (selectedAddressTextEl) {
    selectedAddressTextEl.textContent = summary || "Location saved";
  }
  selectedAddressEl.hidden = false;
}


selectedAddressEl?.addEventListener("click", () => {
  openDeliveryPicker();
});

function setupPaymentOptions() {
  paymentOptions?.querySelectorAll("[data-payment]").forEach(option => {
    option.addEventListener("click", () => {
      paymentOptions.querySelectorAll("[data-payment]").forEach(item => {
        item.classList.remove("selected");
        item.setAttribute("aria-pressed", "false");
      });

      option.classList.add("selected");
      option.setAttribute("aria-pressed", "true");
      selectedPayment = option.dataset.payment;
      updatePaymentState();
    });
  });
}

function updatePaymentState() {
  paymentOptions?.querySelectorAll("[data-payment]").forEach(option => {
    const isSelected = option.dataset.payment === selectedPayment;
    option.classList.toggle("selected", isSelected);
    option.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });

  const hasPayment = Boolean(selectedPayment);
  if (paymentMessage) {
    paymentMessage.hidden = !hasPayment;
    if (hasPayment) {
      paymentMessage.textContent = selectedPayment === "cod"
        ? "Cash on Delivery selected. You can pay when your order arrives."
        : "Online PAY selected. Your order will be recorded with Online PAY as the payment method.";
    }
  }

  if (placeOrderWrap) placeOrderWrap.hidden = !hasPayment;
  if (placeOrderButton) placeOrderButton.disabled = !hasPayment || !selectedAddress || !cart.length;
}

placeOrderButton?.addEventListener("click", placeOrder);

async function placeOrder() {
  if (!currentUser || !selectedAddress || !selectedPayment || !cart.length) return;

  placeOrderButton.disabled = true;
  const originalText = placeOrderButton.textContent;
  placeOrderButton.textContent = "SAVING…";

  const itemTotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const tax = Math.round(itemTotal * 0.124 * 100) / 100;
  const payable = itemTotal + tax;
  const orderId = `CG${Date.now().toString().slice(-8)}`;

  const order = {
    id: orderId,
    name: cart.length === 1 ? cart[0].name : `${cart[0].name} + ${cart.length - 1} more item${cart.length - 1 === 1 ? "" : "s"}`,
    emoji: cart[0]?.emoji || "🍗",
    date: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    status: "new",
    items: cart.map(item => `${item.name} × ${Number(item.quantity || 0)}`).join(", "),
    total: payable,
    paymentMethod: selectedPayment === "cod" ? "Cash on Delivery (COD)" : "Online PAY",
    addressLabel: selectedAddress.label || "Other",
    customerName: currentUser.displayName || currentUser.email || "Customer",
    customerEmail: currentUser.email || "",
    mobileNo: selectedAddress.mobile || selectedAddress.receiverNumber || "",
    address: [selectedAddress.door, selectedAddress.area, selectedAddress.landmark, selectedAddress.fullAddress]
      .filter(Boolean)
      .join(", "),
    // Exact destination captured with the saved customer address.
    locationLink: selectedAddress.locationLink ||
      (selectedAddress.latitude != null && selectedAddress.longitude != null
        ? `https://www.google.com/maps/dir/?api=1&destination=${selectedAddress.latitude},${selectedAddress.longitude}`
        : selectedAddress.fullAddress
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAddress.fullAddress)}`
          : ""),
    latitude: selectedAddress.latitude ?? null,
    longitude: selectedAddress.longitude ?? null,
    accuracy: selectedAddress.accuracy ?? null,
    locationLatitude: selectedAddress.latitude ?? null,
    locationLongitude: selectedAddress.longitude ?? null,
    cartItems: cart.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      categoryLabel: item.categoryLabel,
      description: item.description,
      price: Number(item.price || 0),
      emoji: item.emoji,
      quantity: Number(item.quantity || 0)
    }))
  };

  try {
    // The completed order is written directly to Firebase.
    await saveOrder(currentUser, orderId, order);
    // The active cart is also Firebase data and is removed after a successful order.
    await clearCart(currentUser);
    cart = [];

    successModal?.classList.add("open");
    successModal?.setAttribute("aria-hidden", "false");
  } catch (err) {
    console.error("Firebase order save failed:", err);
    alert(`Could not save your order to Firebase. ${err?.code || err?.message || "Please try again."}`);
    placeOrderButton.disabled = false;
    placeOrderButton.textContent = originalText;
  }
}

successOk?.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

function renderCart() {
  const itemsEl = document.getElementById("checkoutItems");
  const itemTotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const tax = Math.round(itemTotal * 0.124 * 100) / 100;
  const payable = itemTotal + tax;

  if (!cart.length) {
    itemsEl.innerHTML = `<div class="checkout-empty">Your cart is empty.<br><button type="button" class="checkout-empty-add" id="checkoutEmptyAdd">ADD MORE</button></div>`;
    checkoutAddMore?.setAttribute("hidden", "true");
    document.getElementById("checkoutEmptyAdd")?.addEventListener("click", () => {
      window.location.href = "index.html#menu";
    });
  } else {
    checkoutAddMore?.removeAttribute("hidden");
    itemsEl.innerHTML = cart.map(item => `
      <div class="checkout-item">
        <div class="checkout-item-main">
          <span class="checkout-item-name">${escapeHtml(item.name)}</span>
          <div class="checkout-item-controls" aria-label="Edit ${escapeHtml(item.name)} quantity">
            <button type="button" data-checkout-minus="${escapeHtml(item.id)}" aria-label="Decrease quantity">−</button>
            <strong>${Number(item.quantity || 0)}</strong>
            <button type="button" data-checkout-plus="${escapeHtml(item.id)}" aria-label="Increase quantity">+</button>
            <button type="button" class="checkout-remove-item" data-checkout-remove="${escapeHtml(item.id)}">REMOVE</button>
          </div>
        </div>
        <strong>₹${(Number(item.price || 0) * Number(item.quantity || 0)).toLocaleString("en-IN")}</strong>
      </div>`).join("");
  }

  document.getElementById("checkoutItemTotal").textContent = `₹${itemTotal.toLocaleString("en-IN")}`;
  document.getElementById("checkoutTax").textContent = `₹${tax.toLocaleString("en-IN")}`;
  document.getElementById("checkoutPayable").textContent = `₹${payable.toLocaleString("en-IN")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[ch]));
}
