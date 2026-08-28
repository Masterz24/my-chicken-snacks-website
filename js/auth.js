import { auth, db } from "./firebase-config.js";
import { getCart, saveCart } from "./cart-store.js";
import { getOrders, deleteOrder } from "./order-store.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateEmail,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

function message(el, text, type = "") {
  if (!el) return;
  el.textContent = text;
  el.className = `auth-message ${type}`;
}

function validUsername(v) {
  return /^[A-Za-z0-9_]{3,20}$/.test(v);
}

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function validPassword(v) {
  return typeof v === "string" && v.length >= 6 && v.length <= 128;
}

function validMobile(v) {
  return /^[6-9]\d{9}$/.test(String(v).trim());
}

function setupMobileAuthKeyboard() {
  if (!document.body?.classList.contains("auth-page")) return;

  const isEditable = element => {
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable;
  };

  const scrollFocusedFieldIntoView = () => {
    const active = document.activeElement;
    if (!isEditable(active) || !active.closest(".auth-form")) return;

    document.body.classList.add("auth-keyboard-open");

    // Android WebView can leave the focused field underneath the soft keyboard.
    // Centering the field after the keyboard has resized the viewport keeps the
    // label, input and validation message comfortably visible while typing.
    window.setTimeout(() => {
      const current = document.activeElement;
      if (!isEditable(current) || !current.closest(".auth-form")) return;
      current.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    }, 80);
  };

  document.addEventListener("focusin", event => {
    if (!isEditable(event.target) || !event.target.closest(".auth-form")) return;
    scrollFocusedFieldIntoView();
    window.setTimeout(scrollFocusedFieldIntoView, 280);
    window.setTimeout(scrollFocusedFieldIntoView, 650);
  });

  document.addEventListener("focusout", event => {
    if (!isEditable(event.target)) return;
    window.setTimeout(() => {
      if (!isEditable(document.activeElement) || !document.activeElement?.closest(".auth-form")) {
        document.body.classList.remove("auth-keyboard-open");
      }
    }, 250);
  });

  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", () => {
    if (document.activeElement?.closest(".auth-form")) {
      window.setTimeout(scrollFocusedFieldIntoView, 60);
    }
  }, { passive: true });
}


function setFieldError(id, text = "") {
  const input = $(id);
  const error = $(`${id}Error`);
  if (input) {
    input.classList.toggle("input-error", Boolean(text));
    input.setAttribute("aria-invalid", text ? "true" : "false");
  }
  if (error) error.textContent = text;
}

function clearSignupErrors() {
  ["username", "email", "mobile", "password", "confirmPassword"].forEach(id => {
    setFieldError(id, "");
  });
}

function clearProfileErrors() {
  ["editUsername", "editEmail", "editMobile", "editCurrentPassword"].forEach(id => {
    setFieldError(id, "");
  });
}

async function emailForUsername(username) {
  const snap = await getDoc(
    doc(db, "usernames", username.toLowerCase())
  );
  return snap.exists() ? snap.data().email : null;
}

function attachPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      if (!input) return;

      input.type =
        input.type === "password"
          ? "text"
          : "password";

      btn.textContent =
        input.type === "password"
          ? "Show"
          : "Hide";
    });
  });
}

// ============================================================
// LOGIN
// ============================================================

const loginForm = $("loginForm");

if (loginForm) {
  const msg = $("loginMessage");

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();

    message(msg, "Signing in…");

    const username =
      $("username").value.trim();

    const password =
      $("password").value;

    if (!validUsername(username)) {
      return message(
        msg,
        "Username must be 3–20 letters, numbers or underscores.",
        "error"
      );
    }

    if (!password) {
      return message(
        msg,
        "Enter your password.",
        "error"
      );
    }

    try {
      const email =
        await emailForUsername(username);

      if (!email) {
        throw new Error(
          "No account found for this username."
        );
      }

      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Customer login is completely independent from the owner console.
      // A valid customer login must have a /users/{uid} profile.
      // Never inspect /hotelOwners here, so owner-console state cannot
      // automatically log a real customer out.
      const customerSnap = await getDoc(doc(db, "users", credential.user.uid));
      if (!customerSnap.exists()) {
        await signOut(auth);
        throw new Error("This account is not configured as a customer account.");
      }

      // Customer sign-in always returns to the homepage.
      // This intentionally ignores redirect query parameters so a successful
      // login never drops the customer back into My Account/another page.
      window.location.replace(new URL("index.html", window.location.href).href);

    } catch (err) {
      console.error(err);

      const text = err?.message?.includes("not configured as a customer account")
        ? err.message
        : "Invalid username or password.";
      message(msg, text, "error");
    }
  });
}


// ============================================================
// SIGN UP
// ============================================================

const signupForm = $("signupForm");

if (signupForm) {
  const msg = $("signupMessage");

  signupForm.addEventListener("submit", async e => {
    e.preventDefault();

    clearSignupErrors();
    if (msg) message(msg, "");

    const username = $("username").value.trim();
    const email = $("email").value.trim().toLowerCase();
    const mobile = $("mobile").value.trim();
    const password = $("password").value;
    const confirm = $("confirmPassword").value;

    let valid = true;

    if (!username) {
      setFieldError("username", "Enter your username.");
      valid = false;
    } else if (!validUsername(username)) {
      setFieldError("username", "Use 3–20 letters, numbers or underscores.");
      valid = false;
    }

    if (!email) {
      setFieldError("email", "Enter your email address.");
      valid = false;
    } else if (!validEmail(email)) {
      setFieldError("email", "Enter a valid email address.");
      valid = false;
    }

    if (!mobile) {
      setFieldError("mobile", "Enter your mobile number.");
      valid = false;
    } else if (!validMobile(mobile)) {
      setFieldError("mobile", "Please Enter valid Mobile number");
      valid = false;
    }

    if (!password) {
      setFieldError("password", "Enter your password.");
      valid = false;
    } else if (!validPassword(password)) {
      setFieldError("password", "Password must contain 6–128 characters.");
      valid = false;
    }

    if (!confirm) {
      setFieldError("confirmPassword", "Re-enter your password.");
      valid = false;
    } else if (password !== confirm) {
      setFieldError("confirmPassword", "Passwords do not match.");
      valid = false;
    }

    if (!valid) {
      return;
    }

    const button = signupForm.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
      button.textContent = "Creating account…";
    }
    message(msg, "Creating your account…");

    try {
      const usernameKey = username.toLowerCase();
      const usernameRef = doc(db, "usernames", usernameKey);
      const existing = await getDoc(usernameRef);

      if (existing.exists()) {
        setFieldError("username", "This username is already taken.");
        message(msg, "Please choose another username.", "error");
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await updateProfile(cred.user, {
        displayName: username
      });

      await setDoc(doc(db, "users", cred.user.uid), {
        username,
        email,
        mobile,
        createdAt: serverTimestamp()
      });

      await setDoc(usernameRef, {
        uid: cred.user.uid,
        email
      });

      message(msg, "Account created successfully. Redirecting…", "success");

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 700);

    } catch (err) {
      console.error(err);

      if (err.code === "auth/email-already-in-use") {
        setFieldError("email", "This email is already registered.");
        message(msg, "Please use another email address.", "error");
      } else if (err.code === "auth/invalid-email") {
        setFieldError("email", "Enter a valid email address.");
        message(msg, "Please correct the email address.", "error");
      } else if (
        err.code === "permission-denied" ||
        err.code === "firestore/permission-denied"
      ) {
        message(msg, "Firestore permission denied. Check your Firestore Rules.", "error");
      } else {
        message(msg, "Could not create the account. Check Firebase setup and try again.", "error");
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Create account";
      }
    }
  });

  $("mobile")?.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
    const value = e.target.value;

    if (value.length > 0 && !/^[6-9]/.test(value)) {
      setFieldError("mobile", "Please Enter valid Mobile number");
    } else if (value.length === 10) {
      setFieldError("mobile", "");
    } else {
      setFieldError("mobile", "");
    }
  });
}

// ============================================================
// FIREBASE BUILT-IN PASSWORD RESET
// SPARK / FREE PLAN COMPATIBLE
// ============================================================

const forgotForm = $("forgotForm");

if (forgotForm) {
  const msg = $("forgotMessage");
  const button = forgotForm.querySelector('button[type="submit"]');
  const emailInput = $("email");
  const COOLDOWN_SECONDS = 30;
  let hasSentResetEmail = false;
  let cooldownUntil = 0;
  let cooldownTimer = null;

  function setResetButton(text, disabled = false) {
    if (!button) return;
    button.textContent = text;
    button.disabled = disabled;
  }

  const successPopup = $("resetSuccessPopup");
  const successClose = $("resetSuccessClose");
  let successPopupTimer = null;

  function showResetSuccessPopup() {
    if (!successPopup) return;
    if (successPopupTimer) clearTimeout(successPopupTimer);
    successPopup.hidden = false;
    requestAnimationFrame(() => successPopup.classList.add("show"));
    successPopupTimer = setTimeout(() => hideResetSuccessPopup(), 5000);
  }

  function hideResetSuccessPopup() {
    if (!successPopup) return;
    successPopup.classList.remove("show");
    setTimeout(() => {
      if (successPopup && !successPopup.classList.contains("show")) successPopup.hidden = true;
    }, 220);
  }

  successClose?.addEventListener("click", hideResetSuccessPopup);

  function stopCooldown() {
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }

  function startCooldown(remainingSeconds = COOLDOWN_SECONDS) {
    stopCooldown();

    let remaining = Math.max(0, Number(remainingSeconds) || 0);

    if (remaining <= 0) {
      setResetButton("Resend mail", false);
      return;
    }

    setResetButton(`Resend in ${remaining}s`, true);

    cooldownTimer = setInterval(() => {
      remaining -= 1;

      if (remaining <= 0) {
        stopCooldown();
        cooldownUntil = 0;
        setResetButton("Resend mail", false);
        return;
      }

      setResetButton(`Resend in ${remaining}s`, true);
    }, 1000);
  }

  if (hasSentResetEmail) {
    setResetButton("Resend mail", false);
  }

  forgotForm.addEventListener("submit", async e => {
    e.preventDefault();

    // Do not allow another request while the 30-second in-memory cooldown is active.
    if (cooldownUntil > Date.now()) {
      startCooldown(Math.ceil((cooldownUntil - Date.now()) / 1000));
      return;
    }

    const email = emailInput.value.trim().toLowerCase();

    if (!validEmail(email)) {
      return message(
        msg,
        "Enter a valid email address.",
        "error"
      );
    }

    setResetButton("Sending reset email…", true);
    message(msg, "Sending your password reset email…");

    try {
      await sendPasswordResetEmail(auth, email);

      hasSentResetEmail = true;
      cooldownUntil = Date.now() + COOLDOWN_SECONDS * 1000;

      // Show the successful send as a highlighted pop-up for both the first
      // send and every later "Resend mail" click.
      message(msg, "");
      showResetSuccessPopup();

      startCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      console.error(err);

      setResetButton(
        hasSentResetEmail ? "Resend mail" : "Send reset email",
        false
      );

      const code = String(err?.code || "");

      if (code === "auth/invalid-email") {
        message(
          msg,
          "Enter a valid email address.",
          "error"
        );
      } else if (code === "auth/user-not-found") {
        message(
          msg,
          "No account was found for that email address.",
          "error"
        );
      } else if (code === "auth/too-many-requests") {
        message(
          msg,
          "Too many requests. Please wait a while and try again.",
          "error"
        );
      } else {
        message(
          msg,
          "Could not send the reset email. Check your Firebase Authentication email settings and try again.",
          "error"
        );
      }
    }
  });
}


// ============================================================
// ACCOUNT DASHBOARD
// ============================================================

async function getCartCount(user) {
  if (!user) return 0;
  try {
    const cart = await getCart(user);
    return cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  } catch (err) {
    console.error("Firebase cart count failed:", err);
    return 0;
  }
}

function setProfileText(user, profile = {}) {
  const username =
    profile.username ||
    user.displayName ||
    user.email?.split("@")[0] ||
    "Account";

  const email = user.email || profile.email || "—";
  const mobile = profile.mobile || "Not added";
  const initials = username.slice(0, 2).toUpperCase();

  if ($("accountUsername")) $("accountUsername").textContent = username;
  if ($("accountEmail")) $("accountEmail").textContent = email;
  if ($("accountMobile")) $("accountMobile").textContent = mobile;

  if ($("heroUsername")) $("heroUsername").textContent = `Welcome, ${username}`;
  if ($("heroEmail")) $("heroEmail").textContent = email;
  if ($("headerUsername")) $("headerUsername").textContent = username;
  if ($("dropdownUsername")) $("dropdownUsername").textContent = username;
  if ($("dropdownEmail")) $("dropdownEmail").textContent = email;
  if ($("settingsEmail")) $("settingsEmail").textContent = email;

  ["profileAvatar", "dropdownAvatar"].forEach(id => {
    if ($(id)) $(id).textContent = initials;
  });

  if ($("accountCartCount")) $("accountCartCount").textContent = "0";

  // Keep the current profile available to the edit dialog.
  window.__chickenGrayProfile = {
    username,
    email,
    mobile: profile.mobile || ""
  };
}

const MENU_REORDER_ITEMS = [
  { id: 1, name: "Chicken 65", category: "chicken", categoryLabel: "Chicken GRAY", description: "Crispy, spicy chicken bites made fresh.", price: 199, emoji: "🍗" },
  { id: 2, name: "Pepper Chicken", category: "chicken", categoryLabel: "Chicken GRAY", description: "Juicy chicken tossed with pepper & herbs.", price: 210, emoji: "🍖" },
  { id: 3, name: "Chicken Wings", category: "chicken", categoryLabel: "Chicken GRAY", description: "Golden wings with a flavourful coating.", price: 190, emoji: "🍗" },
  { id: 4, name: "Masala Chicken", category: "chicken", categoryLabel: "Chicken GRAY", description: "Homestyle masala with tender chicken.", price: 220, emoji: "🍲" },
  { id: 5, name: "Murukku", category: "snacks", categoryLabel: "Snacks", description: "Crunchy traditional homemade snack.", price: 90, emoji: "🥨" },
  { id: 6, name: "Mixture", category: "snacks", categoryLabel: "Snacks", description: "Crispy, savoury mix for tea time.", price: 100, emoji: "🥜" },
  { id: 7, name: "Chicken + Snack Box", category: "combos", categoryLabel: "Combo", description: "A satisfying chicken and snack combo.", price: 299, emoji: "🍱" },
  { id: 8, name: "Family Feast", category: "combos", categoryLabel: "Combo", description: "A bigger box made for sharing.", price: 499, emoji: "🍱" }
];

function escapeOrderHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[ch]));
}

function getReorderItems(order) {
  if (Array.isArray(order.cartItems) && order.cartItems.length) {
    return order.cartItems.map(item => ({
      id: Number(item.id),
      name: item.name,
      category: item.category,
      categoryLabel: item.categoryLabel,
      description: item.description,
      price: Number(item.price || 0),
      emoji: item.emoji,
      quantity: Math.max(1, Number(item.quantity || 1))
    }));
  }

  // Compatibility for orders created before cartItems was added.
  const text = String(order.items || "");
  return text.split(/,\s*/).map(part => {
    const match = part.match(/^(.*?)\s*[×x]\s*(\d+)$/);
    const name = (match ? match[1] : part).trim();
    const quantity = Math.max(1, Number(match?.[2] || 1));
    const product = MENU_REORDER_ITEMS.find(item => item.name.toLowerCase() === name.toLowerCase());
    return product ? { ...product, quantity } : null;
  }).filter(Boolean);
}

async function renderOrders(user) {
  const list = $("ordersList");
  if (!list || !user) return;

  list.innerHTML = `<div class="empty-orders"><div class="empty-icon">🛍️</div><h3>Loading orders…</h3><p>Getting your orders securely from Firebase.</p></div>`;

  let orders = [];
  try {
    orders = await getOrders(user);
  } catch (err) {
    console.error("Firebase orders load failed:", err);
    list.innerHTML = `<div class="empty-orders"><div class="empty-icon">⚠️</div><h3>Could not load orders</h3><p>${escapeOrderHtml(err?.message || "Please check your Firebase connection and Firestore rules.")}</p></div>`;
    return;
  }

  // Order history intentionally contains completed deliveries only.
  orders = orders.filter(order => String(order.status || "").toLowerCase() === "delivered" || order.delivered === true);

  if (!orders.length) {
    list.innerHTML = `
      <div class="empty-orders">
        <div class="empty-icon">🛍️</div>
        <h3>No delivered orders yet</h3>
        <p>Orders will move here automatically after the restaurant marks them Delivered.</p>
        <a href="index.html#menu" class="account-action">Explore menu</a>
      </div>`;
    return;
  }

  list.innerHTML = orders.map((order) => `
    <article class="order-card" data-order-id="${escapeOrderHtml(order.id)}">
      <div class="order-top">
        <div class="order-identity">
          <div class="order-icon">${escapeOrderHtml(order.emoji || "🍗")}</div>
          <div>
            <h3 class="order-name">${escapeOrderHtml(order.name || "Chicken GRAY order")}</h3>
            <p class="order-meta">ORDER #${escapeOrderHtml(order.id || "—")}<br>${escapeOrderHtml(order.date || "Recent order")}</p>
          </div>
        </div>
        <div class="order-status">Delivered ✓</div>
      </div>

      <div class="order-items">
        <span>${escapeOrderHtml(order.items || "Chicken GRAY + Snacks")}</span>
        <span class="order-total">Total: ₹${Number(order.total || 0).toLocaleString("en-IN")}</span>
      </div>

      ${order.paymentMethod || order.addressLabel ? `
        <div class="order-extra-info">
          ${order.paymentMethod ? `<span><strong>Payment:</strong> ${escapeOrderHtml(order.paymentMethod)}</span>` : ""}
          ${order.addressLabel ? `<span><strong>Delivery:</strong> ${escapeOrderHtml(order.addressLabel)}</span>` : ""}
        </div>` : ""}

      <div class="order-actions">
        <button type="button" class="order-action" data-reorder-id="${escapeOrderHtml(order.id)}">REORDER</button>
        <button type="button" class="order-action secondary" data-help-order="${escapeOrderHtml(order.id)}">HELP</button>
        <button type="button" class="order-action delete-order-action" data-delete-order="${escapeOrderHtml(order.id)}">DELETE</button>
      </div>
    </article>
  `).join("");

  list.dataset.ordersLoaded = "true";
}

function openOrderHelp() {
  const modal = $("orderHelpModal");
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeOrderHelp() {
  const modal = $("orderHelpModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function setupOrderActions() {
  const list = $("ordersList");
  if (!list) return;

  list.addEventListener("click", async e => {
    const reorderButton = e.target.closest("[data-reorder-id]");
    const helpButton = e.target.closest("[data-help-order]");
    const deleteButton = e.target.closest("[data-delete-order]");

    if (helpButton) {
      openOrderHelp();
      return;
    }

    if (!reorderButton && !deleteButton) return;

    const user = auth.currentUser;
    if (!user) {
      window.location.href = "login.html?redirect=dashboard.html";
      return;
    }

    let orders = [];
    try {
      orders = await getOrders(user);
    } catch (err) {
      console.error("Firebase orders load failed:", err);
      alert("Could not load your orders from Firebase.");
      return;
    }

    const orderId = (reorderButton || deleteButton).dataset.reorderId || (reorderButton || deleteButton).dataset.deleteOrder;
    const order = orders.find(item => item.id === orderId);
    if (!order) {
      alert("That order could not be found in Firebase.");
      await renderOrders(user);
      return;
    }

    if (reorderButton) {
      const items = getReorderItems(order);
      if (!items.length) {
        alert("This older order cannot be reordered automatically. Please choose the items again from the menu.");
        return;
      }
      try {
        await saveCart(user, items);
        window.location.href = "checkout.html";
      } catch (err) {
        console.error("Firebase reorder save failed:", err);
        alert("Could not create your reorder cart in Firebase.");
      }
      return;
    }

    if (deleteButton) {
      if (!window.confirm("Delete this order from your order history?")) return;
      try {
        await deleteOrder(user, orderId);
        await renderOrders(user);
      } catch (err) {
        console.error("Firebase order delete failed:", err);
        alert("Could not delete this order from Firebase. Please try again.");
      }
    }
  });

  $("closeOrderHelp")?.addEventListener("click", closeOrderHelp);
  $("orderHelpOk")?.addEventListener("click", closeOrderHelp);
  $("orderHelpModal")?.addEventListener("click", e => {
    if (e.target === $("orderHelpModal")) closeOrderHelp();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeOrderHelp();
  });
}

window.__refreshOrderHistory = () => {
  const user = auth.currentUser;
  if (user) renderOrders(user);
};

async function saveProfileChanges(user) {
  const username = $("editUsername")?.value.trim();
  const email = $("editEmail")?.value.trim().toLowerCase();
  const mobile = $("editMobile")?.value.trim();
  const currentPassword = $("editCurrentPassword")?.value || "";

  clearProfileErrors();

  let valid = true;

  if (!username) {
    setFieldError("editUsername", "Enter your username.");
    valid = false;
  } else if (!validUsername(username)) {
    setFieldError("editUsername", "Use 3–20 letters, numbers or underscores.");
    valid = false;
  }

  if (!email) {
    setFieldError("editEmail", "Enter your email address.");
    valid = false;
  } else if (!validEmail(email)) {
    setFieldError("editEmail", "Enter a valid email address.");
    valid = false;
  }

  if (!mobile) {
    setFieldError("editMobile", "Enter your mobile number.");
    valid = false;
  } else if (!validMobile(mobile)) {
    setFieldError("editMobile", "Please Enter valid Mobile number");
    valid = false;
  }

  const oldProfile = window.__chickenGrayProfile || {};
  const emailChanged = email !== String(oldProfile.email || user.email || "").toLowerCase();
  const usernameChanged = username.toLowerCase() !== String(oldProfile.username || "").toLowerCase();

  if (emailChanged && !currentPassword) {
    setFieldError("editCurrentPassword", "Enter your current password to change email.");
    valid = false;
  }

  if (!valid) return false;

  const newUsernameKey = username.toLowerCase();
  const oldUsernameKey = String(oldProfile.username || "").toLowerCase();

  try {
    if (usernameChanged) {
      const newUsernameRef = doc(db, "usernames", newUsernameKey);
      const existing = await getDoc(newUsernameRef);

      if (existing.exists() && existing.data().uid !== user.uid) {
        setFieldError("editUsername", "This username is already taken.");
        return false;
      }
    }

    if (emailChanged) {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, email);
    }

    if (usernameChanged) {
      await updateProfile(user, { displayName: username });
    }

    const userRef = doc(db, "users", user.uid);
    const updateData = {
      username,
      email,
      mobile,
      updatedAt: serverTimestamp()
    };
    await updateDoc(userRef, updateData);

    if (usernameChanged) {
      const batch = writeBatch(db);
      batch.set(doc(db, "usernames", newUsernameKey), {
        uid: user.uid,
        email
      });
      if (oldUsernameKey && oldUsernameKey !== newUsernameKey) {
        batch.delete(doc(db, "usernames", oldUsernameKey));
      }
      await batch.commit();
    } else {
      await updateDoc(doc(db, "usernames", newUsernameKey), { email });
    }

    setProfileText(user, { username, email, mobile });
    return true;

  } catch (err) {
    console.error(err);
    const code = String(err?.code || "");

    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      setFieldError("editCurrentPassword", "Current password is incorrect.");
    } else if (code === "auth/requires-recent-login") {
      setFieldError("editCurrentPassword", "For security, sign in again and then change your email.");
    } else if (code === "auth/email-already-in-use") {
      setFieldError("editEmail", "This email is already registered.");
    } else if (code === "auth/invalid-email") {
      setFieldError("editEmail", "Enter a valid email address.");
    } else if (code.includes("permission-denied")) {
      setFieldError("editUsername", "Profile update was blocked by Firestore Rules.");
    } else {
      setFieldError("editUsername", "Could not update your profile. Please try again.");
    }

    return false;
  }
}

function setupProfileEditor(user) {
  const modal = $("profileEditModal");
  const form = $("profileEditForm");
  if (!modal || !form) return;

  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    clearProfileErrors();
  };

  const open = focusField => {
    const profile = window.__chickenGrayProfile || {};
    $("editUsername").value = profile.username || "";
    $("editEmail").value = profile.email || user.email || "";
    $("editMobile").value = profile.mobile || "";
    $("editCurrentPassword").value = "";
    clearProfileErrors();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => {
      $(focusField || "editUsername")?.focus();
    }, 30);
  };

  document.querySelectorAll("[data-edit-profile]").forEach(button => {
    button.addEventListener("click", () => open(button.dataset.editProfile));
  });

  $("closeProfileEdit")?.addEventListener("click", close);
  $("cancelProfileEdit")?.addEventListener("click", close);

  modal.addEventListener("click", e => {
    if (e.target === modal) close();
  });

  $("editMobile")?.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
    if (e.target.value.length === 10) setFieldError("editMobile", "");
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const saveButton = form.querySelector('button[type="submit"]');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Saving…";
    }

    const saved = await saveProfileChanges(user);

    if (saved) {
      close();
    }

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save changes";
    }
  });
}

function setupAccountUI() {
  const dropdown =
    $("accountDropdown");

  const profileButton =
    $("accountProfileButton");

  const mobileButton =
    $("accountMobileMenu");

  const mobileNav =
    $("accountMobileNav");

  profileButton?.addEventListener(
    "click",
    e => {
      e.stopPropagation();

      const open =
        dropdown?.classList.toggle(
          "open"
        );

      profileButton.setAttribute(
        "aria-expanded",
        String(Boolean(open))
      );
    }
  );

  mobileButton?.addEventListener(
    "click",
    e => {
      e.stopPropagation();

      const open =
        mobileNav?.classList.toggle(
          "open"
        );

      mobileButton.setAttribute(
        "aria-expanded",
        String(Boolean(open))
      );
    }
  );

  document.addEventListener(
    "click",
    e => {
      if (
        dropdown &&
        !dropdown.contains(e.target) &&
        !profileButton?.contains(e.target)
      ) {
        dropdown.classList.remove(
          "open"
        );

        profileButton?.setAttribute(
          "aria-expanded",
          "false"
        );
      }
    }
  );

  const openAccountTab = (tab, updateHash = true) => {
    if (!tab) return;

    const panel = document.querySelector(`[data-panel="${tab}"]`);
    if (!panel) return;

    document
      .querySelectorAll("[data-panel]")
      .forEach(item =>
        item.classList.toggle(
          "hidden",
          item.dataset.panel !== tab
        )
      );

    document
      .querySelectorAll(".account-side-item")
      .forEach(item =>
        item.classList.toggle(
          "active",
          item.dataset.accountTab === tab
        )
      );

    dropdown?.classList.remove("open");
    mobileNav?.classList.remove("open");
    profileButton?.setAttribute("aria-expanded", "false");

    if (updateHash && window.location.hash !== `#${tab}`) {
      window.history.pushState(null, "", `#${tab}`);
    }

    window.scrollTo({
      top: document.querySelector(".account-layout")?.offsetTop - 70 || 0,
      behavior: "smooth"
    });

    window.dispatchEvent(new CustomEvent("account-tab-changed", {
      detail: { tab }
    }));
  };

  // Expose one reliable account-tab action for the mobile bottom navigation.
  // This avoids depending on a full page reload when the user taps Orders
  // while already inside My Account.
  window.__openAccountTab = openAccountTab;

  document
    .querySelectorAll("[data-account-tab]")
    .forEach(button => {
      button.addEventListener("click", () => {
        openAccountTab(button.dataset.accountTab);
      });
    });

  window.addEventListener("hashchange", () => {
    const requestedTab = window.location.hash.replace(/^#/, "");
    if (requestedTab) openAccountTab(requestedTab, false);
  });

  $("logoutButton")
    ?.addEventListener(
      "click",
      logout
    );

  $("dropdownLogout")
    ?.addEventListener(
      "click",
      logout
    );

  $("mobileLogout")
    ?.addEventListener(
      "click",
      logout
    );

  renderOrders();

  // Open the requested account section when returning to a hash URL,
  // for example dashboard.html#addresses after saving a delivery address.
  const requestedTab = window.location.hash.replace(/^#/, "");
  if (requestedTab) {
    openAccountTab(requestedTab, false);
  }
}

async function logout() {
  try {
    await signOut(auth);
    window.location.href =
      "index.html";
  } catch (err) {
    console.error(err);
  }
}

const dashboard =
  $("dashboard");

if (dashboard) {
  setupAccountUI();
setupOrderActions();

  onAuthStateChanged(
    auth,
    async user => {
      if (!user) {
        window.location.href =
          "login.html";
        return;
      }

      try {
        // Customer dashboard only uses the customer profile.
        // It never checks /hotelOwners, keeping customer and owner sessions
        // fully separated at the application layer.
        const snap =
          await getDoc(
            doc(
              db,
              "users",
              user.uid
            )
          );

        if (!snap.exists()) {
          await signOut(auth);
          window.location.href = "login.html?role=customer";
          return;
        }

        const profile = snap.exists() ? snap.data() : {};
        setProfileText(user, profile);
        setupProfileEditor(user);
        await renderOrders(user);
        const count = await getCartCount(user);
        if ($("accountCartCount")) $("accountCartCount").textContent = String(count);

      } catch (err) {
        console.error(err);
        setProfileText(user, {});
        setupProfileEditor(user);
        await renderOrders(user);
        const count = await getCartCount(user);
        if ($("accountCartCount")) $("accountCartCount").textContent = String(count);
      }
    }
  );
}

attachPasswordToggles();
setupMobileAuthKeyboard();
