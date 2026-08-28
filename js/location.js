import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getSavedAddresses, createAddress, updateAddress, removeAddress } from "./address-store.js";

const $ = id => document.getElementById(id);
const trigger = $("locationTrigger");
const modal = $("locationModal");
const overlay = $("locationOverlay");

if (trigger && modal && overlay) {
  window.__customerLocationModuleReady = true;
  const closeButton = $("locationClose");
  const allowButton = $("allowLocationButton");
  const manualButton = $("manualLocationButton");
  const backButton = $("backToLocationButton");
  const form = $("addressForm");
  const permission = $("locationPermission");
  const blocked = $("locationBlocked");
  const loginRequired = $("locationLoginRequired");
  const loginButton = $("locationLoginButton");
  const savedBox = $("savedAddressesBox");
  const savedList = $("savedAddressesList");
  const addAnother = $("addAnotherAddressButton");
  const message = $("locationMessage");
  const status = $("addressLocationStatus");
  const locationText = $("locationText");
  const mapElement = $("locationMap");

  let currentUser = null;
  let selectedCoords = { latitude: null, longitude: null, accuracy: null };
  let editingId = null;
  let map = null;
  let marker = null;
  let reverseGeocodeTimer = null;
  let reverseGeocodeRequest = 0;

  onAuthStateChanged(auth, async user => {
    currentUser = user;

    // The header should always start with the requested caption after login.
    // It changes to an address only after the user selects/saves one.
    if (locationText) {
      locationText.textContent = "Enter the Location";
      locationText.title = "Enter the Location";
    }

    if (user) {
      await renderSavedAddresses();
      updateLoginState();

      // After signing in from the delivery-location popup, return to the
      // homepage and reopen the popup in its fully unlocked state.
      const params = new URLSearchParams(window.location.search);
      if (params.get("openLocation") === "1") {
        params.delete("openLocation");
        const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
        window.history.replaceState({}, document.title, cleanUrl);
        openModal();
      }
    } else {
      updateLoginState();
      clearSavedAddresses();
    }
  });

  function updateLoginState() {
    if (!currentUser) {
      // Keep the sign-in card fully visible, but show the location card
      // underneath it in a blurred, non-interactive state until the user
      // signs in.
      loginRequired.hidden = false;
      permission.hidden = true;
      permission.classList.remove("location-permission-locked");
      form.hidden = true;
      savedBox.hidden = true;
      return;
    }

    loginRequired.hidden = true;
    permission.hidden = false;
    permission.classList.remove("location-permission-locked");
    form.hidden = true;
    savedBox.hidden = false;
  }

  function openModal() {
    modal.hidden = false;
    overlay.hidden = false;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    document.body.classList.add("location-modal-open");
    resetForm();

    if (!currentUser) {
      loginRequired.hidden = false;
      permission.hidden = true;
      permission.classList.remove("location-permission-locked");
      form.hidden = true;
      savedBox.hidden = true;
      return;
    }

    loginRequired.hidden = true;
    permission.hidden = false;
    permission.classList.remove("location-permission-locked");
    savedBox.hidden = false;
    renderSavedAddresses();
  }

  function closeModal() {
    modal.hidden = true;
    overlay.hidden = true;
    document.body.style.overflow = "";
    document.body.classList.remove("location-modal-open");
    resetForm();
  }

  function resetForm() {
    editingId = null;
    if (form) form.hidden = true;
    if (permission) {
      permission.hidden = !currentUser;
      permission.classList.remove("location-permission-locked");
    }
    if (savedBox) savedBox.hidden = !currentUser;
    if (loginRequired) loginRequired.hidden = Boolean(currentUser);
    if (blocked) blocked.hidden = true;
    if (form) form.reset();
    updateReceiverFields(false);
    clearFieldErrors();
    selectedCoords = { latitude: null, longitude: null, accuracy: null };
    if (status) status.textContent = "Location not selected yet.";
    const caption = $("mapCaption");
    if (caption) caption.textContent = "Choose a location";
    if (message) {
      message.textContent = "";
      message.className = "location-message";
    }
    if (map && marker) {
      map.removeLayer(marker);
      marker = null;
      map.setView([20.5937, 78.9629], 5);
    }
  }

  function showForm(address = {}) {
    if (!currentUser) {
      showLoginRequired();
      return;
    }

    permission.hidden = true;
    loginRequired.hidden = true;
    form.hidden = false;
    savedBox.hidden = true;

    $("addressLabel").value = address.label || "Home";
    syncAddressLabelButtons("addressLabel");
    $("addressDoor").value = address.door || "";
    $("addressArea").value = address.area || "";
    $("addressLandmark").value = address.landmark || "";
    $("addressMobile").value = address.mobile || "";
    $("addressReceiverName").value = address.receiverName || "";
    $("addressReceiverNumber").value = address.receiverNumber || "";
    clearFieldErrors();
    updateReceiverFields(false);
    if (address.mobile) $("addressMobile").value = String(address.mobile).replace(/\D/g, "").slice(0, 10);
    if (address.receiverNumber) $("addressReceiverNumber").value = String(address.receiverNumber).replace(/\D/g, "").slice(0, 10);
    $("addressFull").value = address.fullAddress || "";

    selectedCoords = {
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      accuracy: address.accuracy ?? null
    };

    requestAnimationFrame(() => initializeMap());

    if (selectedCoords.latitude != null && selectedCoords.longitude != null) {
      updateMap(selectedCoords.latitude, selectedCoords.longitude, selectedCoords.accuracy);
      $("mapCaption").textContent = "Selected location";
      status.textContent = `Location: ${selectedCoords.latitude.toFixed(6)}, ${selectedCoords.longitude.toFixed(6)}${selectedCoords.accuracy ? ` · ±${Math.round(selectedCoords.accuracy)} m` : ""}`;
    } else {
      $("mapCaption").textContent = "Choose your location";
      status.textContent = "Choose your current location or enter the address manually.";
    }
  }

  function showLoginRequired() {
    loginRequired.hidden = false;
    permission.hidden = false;
    permission.classList.add("location-permission-locked");
    form.hidden = true;
    savedBox.hidden = true;
  }

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

  function requestLocation() {
    if (!currentUser) {
      showLoginRequired();
      return;
    }

    blocked.hidden = true;
    message.textContent = "";

    if (!navigator.geolocation) {
      blocked.hidden = false;
      blocked.textContent = "Location is not supported by this browser. Please enter your address manually.";
      return;
    }

    allowButton.disabled = true;
    allowButton.textContent = "Finding location…";

    navigator.geolocation.getCurrentPosition(
      position => {
        allowButton.disabled = false;
        allowButton.textContent = "Allow location";
        selectedCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        showForm({
          label: "Home",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      error => {
        allowButton.disabled = false;
        allowButton.textContent = "Try again";
        blocked.hidden = false;
        if (error.code === error.PERMISSION_DENIED) {
          blocked.textContent = "Location access is blocked. Turn on Location and allow access, then try again.";
        } else {
          blocked.textContent = "We could not get your location. Please turn on Location and try again.";
        }
        showLocationTurnOnPopup();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function initializeMap() {
    if (!mapElement || !window.L) return;
    if (map) {
      map.invalidateSize();
      return;
    }

    map = L.map(mapElement, {
      zoomControl: true,
      attributionControl: true
    }).setView([20.5937, 78.9629], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);

    map.on("click", event => {
      if (!currentUser || form.hidden) return;
      const { lat, lng } = event.latlng;
      setMapMarker(lat, lng, null, true);
    });
  }

  function setMapMarker(latitude, longitude, accuracy, shouldReverseGeocode = true) {
    initializeMap();
    if (!map) return;

    const position = [latitude, longitude];
    if (marker) {
      marker.setLatLng(position);
    } else {
      marker = L.marker(position, { draggable: true }).addTo(map);
      marker.bindTooltip("Drag the pin to change your delivery location", { direction: "top", offset: [0, -10] });
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        selectedCoords.latitude = pos.lat;
        selectedCoords.longitude = pos.lng;
        selectedCoords.accuracy = null;
        updateMapStatus(pos.lat, pos.lng, null);
        reverseGeocode(pos.lat, pos.lng);
      });
    }

    selectedCoords.latitude = latitude;
    selectedCoords.longitude = longitude;
    selectedCoords.accuracy = accuracy ?? null;
    marker.bindPopup(`<strong>Delivery location</strong><br>Drag this pin or click another place on the map.`);
    map.setView(position, 17, { animate: true });
    setTimeout(() => map.invalidateSize(), 100);

    updateMapStatus(latitude, longitude, accuracy);
    if (shouldReverseGeocode) reverseGeocode(latitude, longitude);
  }

  function updateMap(latitude, longitude, accuracy) {
    setMapMarker(latitude, longitude, accuracy, true);
  }

  function updateMapStatus(latitude, longitude, accuracy) {
    if (!status) return;
    status.textContent = `Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}${accuracy ? ` · ±${Math.round(accuracy)} m` : ""}`;
    if ($("mapCaption")) $("mapCaption").textContent = "Drag pin or click map to change";
  }

  async function reverseGeocode(latitude, longitude) {
    const requestId = ++reverseGeocodeRequest;
    if (reverseGeocodeTimer) clearTimeout(reverseGeocodeTimer);

    reverseGeocodeTimer = setTimeout(async () => {
      if (requestId !== reverseGeocodeRequest) return;
      if (message) {
        message.textContent = "Finding the address for this location…";
        message.className = "location-message";
      }

      try {
        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("lat", latitude);
        url.searchParams.set("lon", longitude);
        url.searchParams.set("zoom", "18");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("accept-language", "en");

        const response = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
        if (!response.ok) throw new Error(`Reverse geocoding failed: ${response.status}`);
        const result = await response.json();
        if (requestId !== reverseGeocodeRequest) return;

        const a = result.address || {};
        const area = [a.road, a.neighbourhood || a.suburb, a.city_district].filter(Boolean).join(", ");
        const full = result.display_name || [a.house_number, a.road, a.suburb, a.city, a.state, a.postcode].filter(Boolean).join(", ");

        if (area && $("addressArea")) $("addressArea").value = area;
        if (full && $("addressFull")) $("addressFull").value = full;

        // Show the detected address in the fixed-width header location box
        // immediately after reverse geocoding. CSS truncates long addresses
        // with an ellipsis so the box never grows or pushes the search box.
        if (locationText) {
          locationText.textContent = full || area || "Enter the Location";
          locationText.title = full || area || "Enter the Location";
        }

        if (message) {
          message.textContent = "Address filled automatically. You can edit the fields below.";
          message.className = "location-message success";
        }
      } catch (err) {
        console.warn("Reverse geocoding unavailable:", err);
        if (message) {
          message.textContent = "Location selected. Please check or enter the address below.";
          message.className = "location-message";
        }
      }
    }, 250);
  }

  async function renderSavedAddresses() {
    if (!savedList || !currentUser) return;
    try {
      const addresses = await getSavedAddresses(currentUser);
      savedBox.hidden = false;
      if (!addresses.length) {
        savedList.innerHTML = `<div style="padding:12px 0;color:#777067;font-size:12px;">No saved addresses yet.</div>`;
        return;
      }

      savedList.innerHTML = addresses.map(address => {
        const summary = [address.door, address.area, address.landmark, address.fullAddress].filter(Boolean).join(", ");
        return `
          <article class="saved-address-card">
            <div>
              <strong>${escapeHtml(address.label || "Other")}</strong>
              <small>${escapeHtml(summary || "Location saved")}</small>
            </div>
            <div class="saved-address-actions">
              <button type="button" data-use-address="${escapeHtml(address.id)}">Use</button>
              <button type="button" data-edit-address="${escapeHtml(address.id)}">Edit</button>
              <button type="button" class="delete-address" data-delete-address="${escapeHtml(address.id)}">Delete</button>
            </div>
          </article>`;
      }).join("");
    } catch (err) {
      console.error(err);
      savedList.innerHTML = `<div style="padding:12px 0;color:#a83a2c;font-size:12px;">Could not load saved addresses.</div>`;
    }
  }

  function clearSavedAddresses() {
    if (savedList) savedList.innerHTML = "";
  }

  savedList?.addEventListener("click", async e => {
    if (!currentUser) return showLoginRequired();

    const use = e.target.closest("[data-use-address]");
    const edit = e.target.closest("[data-edit-address]");
    const del = e.target.closest("[data-delete-address]");

    try {
      const addresses = await getSavedAddresses(currentUser);
      if (use) {
        const item = addresses.find(a => a.id === use.dataset.useAddress);
        if (item) {
          if (locationText) {
            locationText.textContent = item.fullAddress || item.area || "Enter the Location";
            locationText.title = item.fullAddress || item.area || "Enter the Location";
          }
          closeModal();
        }
      }
      if (edit) {
        const item = addresses.find(a => a.id === edit.dataset.editAddress);
        if (item) {
          editingId = item.id;
          showForm(item);
        }
      }
      if (del) {
        const item = addresses.find(a => a.id === del.dataset.deleteAddress);
        if (item && confirm(`Delete the ${item.label || "saved"} address?`)) {
          await removeAddress(currentUser, item.id);
          await renderSavedAddresses();
        }
      }
    } catch (err) {
      console.error(err);
      message.textContent = "Could not update the saved address. Please try again.";
      message.className = "location-message error";
    }
  });

  function updateReceiverFields(clearWhenHidden = true) {
    const nameField = $("receiverNameField");
    const numberField = $("receiverNumberField");
    const label = $("addressLabel")?.value || "Home";
    const isOther = label === "Other";

    // Receiver details are ONLY applicable to "Other".
    [nameField, numberField].forEach(field => {
      if (!field) return;
      field.hidden = !isOther;
      field.setAttribute("aria-hidden", isOther ? "false" : "true");
      field.style.setProperty("display", isOther ? "grid" : "none", "important");
    });

    if (clearWhenHidden && !isOther) {
      const nameInput = $("addressReceiverName");
      const numberInput = $("addressReceiverNumber");
      if (nameInput) nameInput.value = "";
      if (numberInput) numberInput.value = "";
      ["addressReceiverNameError", "addressReceiverNumberError"].forEach(errorId => {
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
    if (input) {
      input.style.borderColor = "#a83a2c";
      input.focus();
    }
  }

  function clearFieldErrors() {
    [
      ["addressDoorError", "addressDoor"],
      ["addressAreaError", "addressArea"],
      ["addressMobileError", "addressMobile"],
      ["addressReceiverNameError", "addressReceiverName"],
      ["addressReceiverNumberError", "addressReceiverNumber"],
      ["addressFullError", "addressFull"]
    ].forEach(([errorId, inputId]) => {
      const error = $(errorId);
      const input = $(inputId);
      if (error) error.hidden = true;
      if (input) input.style.borderColor = "";
    });
  }

  form?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentUser) {
      showLoginRequired();
      return;
    }

    clearFieldErrors();
    const label = $("addressLabel").value;
    const isOther = label === "Other";
    const data = {
      label,
      door: $("addressDoor").value,
      area: $("addressArea").value,
      landmark: $("addressLandmark").value,
      mobile: $("addressMobile").value.replace(/\D/g, ""),
      receiverName: isOther ? $("addressReceiverName").value : "",
      receiverNumber: isOther ? $("addressReceiverNumber").value.replace(/\D/g, "") : "",
      fullAddress: $("addressFull").value,
      ...selectedCoords
    };

    let hasError = false;
    if (!data.door.trim()) {
      showFieldError("addressDoorError", "addressDoor");
      hasError = true;
    }
    if (!data.area.trim()) {
      showFieldError("addressAreaError", "addressArea");
      hasError = true;
    }
    if (data.mobile.length !== 10) {
      showFieldError("addressMobileError", "addressMobile");
      hasError = true;
    }
    if (isOther && !data.receiverName.trim()) {
      showFieldError("addressReceiverNameError", "addressReceiverName");
      hasError = true;
    }
    if (isOther && data.receiverNumber.length !== 10) {
      showFieldError("addressReceiverNumberError", "addressReceiverNumber");
      hasError = true;
    }
    if (!data.fullAddress.trim()) {
      showFieldError("addressFullError", "addressFull");
      hasError = true;
    }

    if (hasError) return;

    const button = $("saveAddressButton");
    button.disabled = true;
    button.textContent = editingId ? "Updating…" : "Saving…";

    try {
      const saved = editingId
        ? await updateAddress(currentUser, editingId, data)
        : await createAddress(currentUser, data);

        if (locationText) {
        locationText.textContent = data.fullAddress || data.area || "Enter the Location";
        locationText.title = data.fullAddress || data.area || "Enter the Location";
      }
      message.textContent = "Address saved successfully.";
      message.className = "location-message success";
      setTimeout(closeModal, 500);
    } catch (err) {
      console.error(err);
      message.textContent = "Could not save the address. Please check your Firebase/Firestore setup.";
      message.className = "location-message error";
    } finally {
      button.disabled = false;
      button.textContent = editingId ? "Update address" : "Save address";
    }
  });

  function syncAddressLabelButtons(selectId) {
    const select = $(selectId);
    const buttons = document.querySelectorAll(`#locationModal .address-label-option[data-label-value]`);
    buttons.forEach(button => {
      const active = button.dataset.labelValue === select?.value;
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  document.querySelectorAll("#locationModal .address-label-option[data-label-value]").forEach(button => {
    button.addEventListener("click", () => {
      const select = $("addressLabel");
      if (!select) return;
      select.value = button.dataset.labelValue;
      syncAddressLabelButtons("addressLabel");
      select.dispatchEvent(new Event("change", { bubbles:true }));
    });
  });

  $("addressLabel")?.addEventListener("change", () => {
    syncAddressLabelButtons("addressLabel");
    updateReceiverFields(true);
  });
  syncAddressLabelButtons("addressLabel");
  ["addressMobile", "addressReceiverNumber"].forEach(id => {
    $(id)?.addEventListener("input", event => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 10);
      const errorId = id === "addressMobile" ? "addressMobileError" : "addressReceiverNumberError";
      const error = $(errorId);
      if (error) error.hidden = true;
      event.target.style.borderColor = "";
    });
  });
  ["addressDoor", "addressArea", "addressReceiverName", "addressFull"].forEach(id => {
    $(id)?.addEventListener("input", event => {
      const errorIdMap = {
        addressDoor:"addressDoorError",
        addressArea:"addressAreaError",
        addressReceiverName:"addressReceiverNameError",
        addressFull:"addressFullError"
      };
      const error = $(errorIdMap[id]);
      if (error) error.hidden = true;
      event.target.style.borderColor = "";
    });
  });

  trigger.addEventListener("click", openModal);
  window.__customerLocationHandlerReady?.();
  closeButton?.addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);
  allowButton?.addEventListener("click", requestLocation);
  manualButton?.addEventListener("click", () => showForm());
  function backToLocationStart() {
    // Return from the address form to the location-selection screen inside
    // the same popup. Do not close the popup or navigate the browser away.
    editingId = null;
    if (form) {
      form.reset();
      updateReceiverFields(false);
      clearFieldErrors();
      form.hidden = true;
    }
    selectedCoords = { latitude: null, longitude: null, accuracy: null };
    if (loginRequired) loginRequired.hidden = Boolean(currentUser);
    if (permission) {
      permission.hidden = !currentUser;
      permission.classList.remove("location-permission-locked");
    }
    if (savedBox) savedBox.hidden = !currentUser;
    if (blocked) blocked.hidden = true;
    if (status) status.textContent = "Location not selected yet.";
    if (message) {
      message.textContent = "";
      message.className = "location-message";
    }
    const caption = $("mapCaption");
    if (caption) caption.textContent = "Choose a location";
    // Return the modal to the location-selection view and place the user at the top.
    if (modal) modal.scrollTop = 0;
  }

  backButton?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    backToLocationStart();
  });
  addAnother?.addEventListener("click", () => showForm());
  loginButton?.addEventListener("click", () => {
    // Return to the homepage and automatically show the logged-in location UI.
    window.location.href = "login.html?redirect=index.html%3FopenLocation%3D1";
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
    }[ch]));
  }
}
