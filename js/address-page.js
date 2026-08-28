import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getSavedAddresses, createAddress, updateAddress, removeAddress } from "./address-store.js";

const $ = id => document.getElementById(id);
let currentUser = null;
const addressParams = new URLSearchParams(location.search);
let editingId = addressParams.get("edit");
const returnToCheckout = addressParams.get("return") === "checkout";
let selectedCoords = { latitude:null, longitude:null, accuracy:null };
let map = null;
let marker = null;
let reverseGeocodeTimer = null;
let reverseGeocodeRequest = 0;

function showLocationTurnOnPopup() {
  document.querySelector('.location-turn-on-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'location-turn-on-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="location-turn-on-popup">
      <div class="location-turn-on-popup-icon">⌖</div>
      <strong>Please Turn ON the Location</strong>
      <p>Turn on Location/GPS on your Android device, then try again.</p>
      <button type="button">OK</button>
    </div>`;
  const close = () => overlay.remove();
  overlay.querySelector('button')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
}


onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) {
    location.href = "login.html?redirect=address.html";
    return;
  }
  $("standaloneAddressForm").hidden = false;
  $("savedAddressesSection").hidden = false;
  updateReceiverFields();
  const cancelLink = document.querySelector(".address-page-actions a[href=\"dashboard.html\"]");
  if (cancelLink && returnToCheckout) cancelLink.href = "checkout.html?openAddress=1";
  clearFieldErrors();
  await initializeMap();
  await load();
  await renderSaved();
});

async function load() {
  if (!editingId) return;
  const addresses = await getSavedAddresses(currentUser);
  const item = addresses.find(a => a.id === editingId);
  if (!item) return;

  $("addressPageTitle").textContent = "Edit delivery address";
  $("standaloneLabel").value = item.label || "Other";
  syncAddressLabelButtons("standaloneLabel");
  $("standaloneDoor").value = item.door || "";
  $("standaloneArea").value = item.area || "";
  $("standaloneLandmark").value = item.landmark || "";
  $("standaloneMobile").value = String(item.mobile || "").replace(/\D/g, "").slice(0, 10);
  $("standaloneReceiverName").value = item.receiverName || "";
  $("standaloneReceiverNumber").value = String(item.receiverNumber || "").replace(/\D/g, "").slice(0, 10);
  clearFieldErrors();
  updateReceiverFields();
  $("standaloneFull").value = item.fullAddress || "";
  selectedCoords = { latitude:item.latitude ?? null, longitude:item.longitude ?? null, accuracy:item.accuracy ?? null };
  updateLocationUI(false);
}

async function initializeMap() {
  if (!window.L || map) return;
  map = L.map("standaloneMap", { zoomControl:true, attributionControl:true }).setView([20.5937, 78.9629], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(map);
  map.on("click", event => {
    const { lat, lng } = event.latlng;
    setMapMarker(lat, lng, null, true);
  });
  setTimeout(() => map.invalidateSize(), 100);
}

function updateLocationUI(shouldReverseGeocode = true) {
  if (selectedCoords.latitude != null && selectedCoords.longitude != null) {
    $("standaloneMapCaption").textContent = "Drag pin or click map to change";
    $("standaloneStatus").textContent = `Location: ${selectedCoords.latitude.toFixed(6)}, ${selectedCoords.longitude.toFixed(6)}${selectedCoords.accuracy ? ` · ±${Math.round(selectedCoords.accuracy)} m` : ""}`;
    updateMap(selectedCoords.latitude, selectedCoords.longitude, selectedCoords.accuracy, shouldReverseGeocode);
  } else {
    $("standaloneMapCaption").textContent = "Choose your current location";
    $("standaloneStatus").textContent = "Choose your current location or enter the address manually.";
    if (marker) {
      map?.removeLayer(marker);
      marker = null;
    }
  }
}

function setMapMarker(latitude, longitude, accuracy, shouldReverseGeocode = true) {
  if (!map) return;
  const position = [latitude, longitude];
  if (marker) {
    marker.setLatLng(position);
  } else {
    marker = L.marker(position, { draggable:true }).addTo(map);
    marker.bindTooltip("Drag the pin to change your delivery location", { direction:"top", offset:[0,-10] });
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      selectedCoords = { latitude:pos.lat, longitude:pos.lng, accuracy:null };
      updateMapStatus(pos.lat, pos.lng, null);
      reverseGeocode(pos.lat, pos.lng);
    });
  }
  selectedCoords.latitude = latitude;
  selectedCoords.longitude = longitude;
  selectedCoords.accuracy = accuracy ?? null;
  marker.bindPopup("<strong>Delivery location</strong><br>Drag this pin or click another place on the map.");
  map.setView(position, 17, { animate:true });
  setTimeout(() => map.invalidateSize(), 100);
  updateMapStatus(latitude, longitude, accuracy);
  if (shouldReverseGeocode) reverseGeocode(latitude, longitude);
}

function updateMap(latitude, longitude, accuracy, shouldReverseGeocode = true) {
  setMapMarker(latitude, longitude, accuracy, shouldReverseGeocode);
}

function updateMapStatus(latitude, longitude, accuracy) {
  $("standaloneStatus").textContent = `Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}${accuracy ? ` · ±${Math.round(accuracy)} m` : ""}`;
  $("standaloneMapCaption").textContent = "Drag pin or click map to change";

  // A map click/drag is a manually selected point, not the device's
  // current location. Keep the action available to re-fetch the device
  // location instead of incorrectly showing "Location selected".
  const locationButton = $("standaloneLocationButton");
  if (locationButton && !locationButton.disabled) {
    locationButton.textContent = "Use current location";
  }
}

async function reverseGeocode(latitude, longitude) {
  const requestId = ++reverseGeocodeRequest;
  if (reverseGeocodeTimer) clearTimeout(reverseGeocodeTimer);
  reverseGeocodeTimer = setTimeout(async () => {
    if (requestId !== reverseGeocodeRequest) return;
    showMessage("Finding the address for this location…", false);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", latitude);
      url.searchParams.set("lon", longitude);
      url.searchParams.set("zoom", "18");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", "en");
      const response = await fetch(url.toString(), { headers:{ "Accept":"application/json" } });
      if (!response.ok) throw new Error(`Reverse geocoding failed: ${response.status}`);
      const result = await response.json();
      if (requestId !== reverseGeocodeRequest) return;
      const a = result.address || {};
      const area = [a.road, a.neighbourhood || a.suburb, a.city_district].filter(Boolean).join(", ");
      const full = result.display_name || [a.house_number, a.road, a.suburb, a.city, a.state, a.postcode].filter(Boolean).join(", ");
      if (area) $("standaloneArea").value = area;
      if (full) $("standaloneFull").value = full;
      showMessage("Address filled automatically. You can edit the fields below.", false);
    } catch (err) {
      console.warn("Reverse geocoding unavailable:", err);
      showMessage("Location selected. Please check or enter the address below.", false);
    }
  }, 250);
}

$("standaloneLocationButton").addEventListener("click", () => {
  if (!currentUser) {
    location.href = "login.html?redirect=address.html";
    return;
  }
  if (!navigator.geolocation) {
    showMessage("This browser does not support location. Enter the address manually.", true);
    return;
  }
  $("standaloneLocationButton").disabled = true;
  $("standaloneLocationButton").textContent = "Finding location…";
  navigator.geolocation.getCurrentPosition(
    position => {
      selectedCoords = {
        latitude:position.coords.latitude,
        longitude:position.coords.longitude,
        accuracy:position.coords.accuracy
      };
      updateLocationUI();
      $("standaloneLocationButton").disabled = false;
      $("standaloneLocationButton").textContent = "Location selected";
    },
    error => {
      $("standaloneLocationButton").disabled = false;
      $("standaloneLocationButton").textContent = "Try again";
      if (error.code === error.PERMISSION_DENIED) {
        showMessage("Location access is blocked. Turn on Location and allow access, then try again.", true);
      } else {
        showMessage("Could not get your location. Please turn on Location and try again.", true);
      }
      showLocationTurnOnPopup();
    },
    { enableHighAccuracy:true, timeout:12000, maximumAge:60000 }
  );
});

$("standaloneManualButton").addEventListener("click", () => {
  selectedCoords = { latitude:null, longitude:null, accuracy:null };
  const locationButton = $("standaloneLocationButton");
  if (locationButton) {
    locationButton.disabled = false;
    locationButton.textContent = "Use current location";
  }
  updateLocationUI();
});

function updateReceiverFields() {
  const nameField = $("standaloneReceiverNameField");
  const numberField = $("standaloneReceiverNumberField");
  const selectedLabel = $("standaloneLabel")?.value || "Home";
  const isOther = selectedLabel === "Other";

  // Receiver details are ONLY applicable to "Other".
  [nameField, numberField].forEach(field => {
    if (!field) return;
    field.hidden = !isOther;
    field.setAttribute("aria-hidden", isOther ? "false" : "true");
    field.style.setProperty("display", isOther ? "grid" : "none", "important");
  });

  if (!isOther) {
    const nameInput = $("standaloneReceiverName");
    const numberInput = $("standaloneReceiverNumber");
    if (nameInput) nameInput.value = "";
    if (numberInput) numberInput.value = "";

    ["standaloneReceiverNameError", "standaloneReceiverNumberError"].forEach(errorId => {
      const error = $(errorId);
      if (error) error.hidden = true;
    });
    if (nameInput) nameInput.style.borderColor = "";
    if (numberInput) numberInput.style.borderColor = "";
  }
}

function showFieldError(errorId, inputId) {
  const error = $(errorId);
  const input = $(inputId);
  if (error) error.hidden = false;
  if (input) input.style.borderColor = "#a83a2c";
}

function clearFieldErrors() {
  [
    ["standaloneDoorError", "standaloneDoor"],
    ["standaloneAreaError", "standaloneArea"],
    ["standaloneMobileError", "standaloneMobile"],
    ["standaloneReceiverNameError", "standaloneReceiverName"],
    ["standaloneReceiverNumberError", "standaloneReceiverNumber"],
    ["standaloneFullError", "standaloneFull"]
  ].forEach(([errorId, inputId]) => {
    const error = $(errorId);
    const input = $(inputId);
    if (error) error.hidden = true;
    if (input) input.style.borderColor = "";
  });
}

function syncAddressLabelButtons(selectId) {
  const select = $(selectId);
  const buttons = document.querySelectorAll(`.address-label-option[data-label-value]`);
  buttons.forEach(button => {
    const active = button.dataset.labelValue === select?.value;
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

document.querySelectorAll('.address-label-option[data-label-value]').forEach(button => {
  button.addEventListener("click", () => {
    const select = $("standaloneLabel");
    if (!select) return;
    select.value = button.dataset.labelValue;
    syncAddressLabelButtons("standaloneLabel");
    updateReceiverFields();
    select.dispatchEvent(new Event("change", { bubbles:true }));
  });
});

$("standaloneLabel").addEventListener("change", () => {
  syncAddressLabelButtons("standaloneLabel");
  updateReceiverFields();
});
syncAddressLabelButtons("standaloneLabel");
["standaloneMobile", "standaloneReceiverNumber"].forEach(id => {
  $(id).addEventListener("input", event => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 10);
    const errorId = id === "standaloneMobile" ? "standaloneMobileError" : "standaloneReceiverNumberError";
    const error = $(errorId);
    if (error) error.hidden = true;
    event.target.style.borderColor = "";
  });
});
["standaloneDoor", "standaloneArea", "standaloneReceiverName", "standaloneFull"].forEach(id => {
  $(id).addEventListener("input", event => {
    const errorIdMap = {
      standaloneDoor:"standaloneDoorError",
      standaloneArea:"standaloneAreaError",
      standaloneReceiverName:"standaloneReceiverNameError",
      standaloneFull:"standaloneFullError"
    };
    const error = $(errorIdMap[id]);
    if (error) error.hidden = true;
    event.target.style.borderColor = "";
  });
});

$("standaloneAddressForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) {
    location.href = "login.html?redirect=address.html";
    return;
  }

  clearFieldErrors();
  const label = $("standaloneLabel").value;
  const isOther = label === "Other";
  const data = {
    label,
    door:$("standaloneDoor").value,
    area:$("standaloneArea").value,
    landmark:$("standaloneLandmark").value,
    mobile:$("standaloneMobile").value.replace(/\D/g, ""),
    receiverName:isOther ? $("standaloneReceiverName").value : "",
    receiverNumber:isOther ? $("standaloneReceiverNumber").value.replace(/\D/g, "") : "",
    fullAddress:$("standaloneFull").value,
    ...selectedCoords
  };

  let hasError = false;
  const firstErrorInput = [];

  if (!data.door.trim()) {
    showFieldError("standaloneDoorError", "standaloneDoor");
    hasError = true;
    firstErrorInput.push("standaloneDoor");
  }
  if (!data.area.trim()) {
    showFieldError("standaloneAreaError", "standaloneArea");
    hasError = true;
    firstErrorInput.push("standaloneArea");
  }
  if (data.mobile.length !== 10) {
    showFieldError("standaloneMobileError", "standaloneMobile");
    hasError = true;
    firstErrorInput.push("standaloneMobile");
  }
  if (label === "Other" && !data.receiverName.trim()) {
    showFieldError("standaloneReceiverNameError", "standaloneReceiverName");
    hasError = true;
    firstErrorInput.push("standaloneReceiverName");
  }
  if (label === "Other" && data.receiverNumber.length !== 10) {
    showFieldError("standaloneReceiverNumberError", "standaloneReceiverNumber");
    hasError = true;
    firstErrorInput.push("standaloneReceiverNumber");
  }
  if (!data.fullAddress.trim()) {
    showFieldError("standaloneFullError", "standaloneFull");
    hasError = true;
    firstErrorInput.push("standaloneFull");
  }

  if (hasError) {
    $(firstErrorInput[0])?.focus();
    return;
  }

  const button = $("standaloneSave");
  button.disabled = true;
  button.textContent = editingId ? "Updating…" : "Saving…";

  try {
    const saved = editingId
      ? await updateAddress(currentUser, editingId, data)
      : await createAddress(currentUser, data);

    showMessage(editingId ? "Address updated successfully." : "Address saved successfully.", false);
    setTimeout(() => {
      if (returnToCheckout) {
        // Return to Secure Checkout and reopen the address picker so the
        // customer can explicitly select the newly added address.
        location.href = "checkout.html?openAddress=1";
      } else {
        location.href = "dashboard.html#addresses";
      }
    }, 500);
  } catch (err) {
    console.error("Address save failed:", err);
    const code = String(err?.code || "").toLowerCase();
    let message = "Could not save the address.";

    if (code.includes("permission-denied")) {
      message = "Firebase permission denied. Publish the firestore.rules file in Firebase Console → Firestore Database → Rules.";
    } else if (code.includes("failed-precondition")) {
      message = "Firestore Database is not enabled. Open Firebase Console → Firestore Database and create the database.";
    } else if (code.includes("unauthenticated")) {
      message = "Your login session is not available. Please log out, log in again, and try saving.";
    } else if (code.includes("unavailable")) {
      message = "Firebase is temporarily unavailable or blocked by the network. Check your internet connection and try again.";
    } else if (code.includes("invalid-argument")) {
      message = "One of the address values is invalid. Check the address fields and try again.";
    } else if (err?.message) {
      message = `Could not save the address: ${err.message}`;
    }

    showMessage(message, true);
    button.disabled = false;
    button.textContent = editingId ? "Update address" : "Save address";
  }
});

async function renderSaved() {
  const list = $("standaloneSavedList");
  const addresses = await getSavedAddresses(currentUser);

  if (!addresses.length) {
    list.innerHTML = `<div class="empty-account-state"><div class="empty-icon">●</div><h3>No saved addresses yet</h3><p>Your saved delivery addresses will appear here.</p></div>`;
    return;
  }

  list.innerHTML = addresses.map(address => {
    const summary = [address.door,address.area,address.landmark,address.fullAddress].filter(Boolean).join(", ");
    return `
      <article class="saved-address-card">
        <div>
          <strong>${escapeHtml(address.label || "Other")}</strong>
          <small>${escapeHtml(summary || "Location saved")}</small>
        </div>
        <div class="saved-address-actions">
          <button type="button" data-select="${escapeHtml(address.id)}">Use</button>
          <a href="address.html?edit=${encodeURIComponent(address.id)}">Edit</a>
          <button type="button" class="delete-address" data-delete="${escapeHtml(address.id)}">Delete</button>
        </div>
      </article>`;
  }).join("");
}

$("standaloneSavedList").addEventListener("click", async e => {
  const use = e.target.closest("[data-select]");
  const del = e.target.closest("[data-delete]");
  const addresses = await getSavedAddresses(currentUser);

  if (use) {
    const item = addresses.find(a => a.id === use.dataset.select);
    if (item) {
      showMessage("Address selected.", false);
    }
  }

  if (del) {
    if (!confirm("Delete this saved address?")) return;
    await removeAddress(currentUser, del.dataset.delete);
    await renderSaved();
  }
});

function showMessage(text, error) {
  $("standaloneMessage").textContent = text;
  $("standaloneMessage").className = `location-message ${error ? "error" : "success"}`;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[ch]));
}
