import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

(() => {
  "use strict";

  const modal = document.getElementById("guestLoginModal");
  if (!modal) return;

  const backdrop = modal.querySelector("[data-guest-auth-backdrop]");
  const skipButton = document.getElementById("guestLoginSkip");
  const form = document.getElementById("guestLoginForm");
  const username = document.getElementById("guestUsername");
  const password = document.getElementById("guestPassword");
  const message = document.getElementById("guestLoginMessage");

  const MODAL_STATE = "__chickenGrayGuestLoginModal";
  let modalOpen = false;
  let restoringHistory = false;
  let authResolved = false;
  let signingIn = false;

  function currentState() {
    const state = window.history.state;
    return state && typeof state === "object" ? state : {};
  }

  function hasModalHistoryState() {
    return currentState()[MODAL_STATE] === true;
  }

  function setMessage(text = "", type = "") {
    if (!message) return;
    message.textContent = text;
    message.className = `guest-auth-message auth-message ${type}`.trim();
  }

  function validUsername(value) {
    return /^[A-Za-z0-9_]{3,20}$/.test(value);
  }

  function setModalVisible(visible) {
    modal.hidden = !visible;
    modal.setAttribute("aria-hidden", visible ? "false" : "true");
    document.body.classList.toggle("guest-auth-modal-open", visible);
    modalOpen = visible;
  }

  function focusLoginField() {
    window.setTimeout(() => {
      if (username && !username.value) username.focus({ preventScroll: true });
      else password?.focus({ preventScroll: true });
    }, 60);
  }

  function openModal({ addHistory = true } = {}) {
    if (modalOpen) return;

    if (addHistory && !hasModalHistoryState()) {
      window.history.pushState(
        { ...currentState(), [MODAL_STATE]: true },
        "",
        window.location.href
      );
    }

    setModalVisible(true);
    focusLoginField();
  }

  function closeModal({ removeHistory = false } = {}) {
    if (!modalOpen) return;

    setModalVisible(false);

    if (removeHistory && hasModalHistoryState() && !restoringHistory) {
      restoringHistory = true;
      window.history.back();
      return;
    }

    restoringHistory = false;
  }

  // Dedicated popup authentication. This intentionally does NOT use the
  // standalone login page's #loginForm handler, so the two flows cannot
  // accidentally share IDs or redirect logic.
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (signingIn) return;

    const userName = username?.value.trim() || "";
    const userPassword = password?.value || "";

    if (!validUsername(userName)) {
      setMessage("Username must be 3–20 letters, numbers or underscores.", "error");
      return;
    }

    if (!userPassword) {
      setMessage("Enter your password.", "error");
      return;
    }

    signingIn = true;
    setMessage("Signing in…");

    try {
      const usernameSnap = await getDoc(doc(db, "usernames", userName.toLowerCase()));
      const email = usernameSnap.exists() ? usernameSnap.data().email : null;
      if (!email) throw new Error("No account found for this username.");

      const credential = await signInWithEmailAndPassword(auth, email, userPassword);
      const customerSnap = await getDoc(doc(db, "users", credential.user.uid));

      if (!customerSnap.exists()) {
        await signOut(auth);
        throw new Error("This account is not configured as a customer account.");
      }

      // The guest popup is part of the homepage. Successful popup login MUST
      // always land on the homepage, never dashboard.html or another page.
      setMessage("Signed in. Opening home…", "success");
      setModalVisible(false);
      window.location.replace(new URL("index.html", window.location.href).href);
    } catch (err) {
      console.error("Guest sign-in failed:", err);
      const text = err?.message?.includes("not configured as a customer account")
        ? err.message
        : err?.message?.includes("No account found")
          ? err.message
          : "Invalid username or password.";
      setMessage(text, "error");
    } finally {
      signingIn = false;
    }
  });

  window.addEventListener("popstate", event => {
    restoringHistory = false;

    if (modalOpen && !event.state?.[MODAL_STATE]) {
      setModalVisible(false);
      return;
    }

    if (!modalOpen && event.state?.[MODAL_STATE] && authResolved && !signingIn) {
      openModal({ addHistory: false });
    }
  });

  backdrop?.addEventListener("click", () => {
    if (modalOpen && hasModalHistoryState()) closeModal({ removeHistory: true });
  });

  skipButton?.addEventListener("click", () => {
    if (!modalOpen) return;
    if (hasModalHistoryState()) closeModal({ removeHistory: true });
    else setModalVisible(false);
  });

  window.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !modalOpen) return;
    if (hasModalHistoryState()) closeModal({ removeHistory: true });
  });

  onAuthStateChanged(auth, user => {
    authResolved = true;
    if (user) {
      setModalVisible(false);
      return;
    }
    openModal();
  });
})();
