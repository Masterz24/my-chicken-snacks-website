import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getSavedAddresses, removeAddress } from "./address-store.js";

const container = document.getElementById("dashboardAddresses");
if (container) {
  let currentUser = null;

  onAuthStateChanged(auth, async user => {
    currentUser = user;
    if (!user) return;
    await render();
  });

  async function render() {
    try {
      const addresses = await getSavedAddresses(currentUser);
      if (!addresses.length) {
        container.innerHTML = `
          <div class="empty-account-state">
            <div class="empty-icon">●</div>
            <h3>No saved addresses</h3>
            <p>Add a delivery address to make checkout faster.</p>
            <a href="address.html" class="account-action">Add address</a>
          </div>`;
        return;
      }

      container.innerHTML = addresses.map(address => {
        const summary = [address.door, address.area, address.landmark, address.fullAddress].filter(Boolean).join(", ");
        return `
          <article class="dashboard-address-card">
            <div class="address-card-top">
              <div>
                <span class="address-card-label">${escapeHtml(address.label || "OTHER")}</span>
                <h3>${escapeHtml(address.door || address.area || "Saved address")}</h3>
              </div>
              <span aria-hidden="true">📍</span>
            </div>
            <p>${escapeHtml(summary || "Location saved")}</p>
            <div class="address-card-actions">
              <a href="address.html?edit=${encodeURIComponent(address.id)}">EDIT</a>
              <button type="button" data-delete="${escapeHtml(address.id)}">DELETE</button>
            </div>
          </article>`;
      }).join("");
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="empty-account-state"><h3>Unable to load addresses</h3><p>Check your Firestore rules and try again.</p></div>`;
    }
  }

  container.addEventListener("click", async e => {
    const button = e.target.closest("[data-delete]");
    if (!button) return;
    if (!confirm("Delete this saved address?")) return;

    button.disabled = true;
    try {
      await removeAddress(currentUser, button.dataset.delete);
      await render();
    } catch (err) {
      console.error(err);
      alert("Could not delete this address.");
      button.disabled = false;
    }
  });

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[ch]));
  }
}
