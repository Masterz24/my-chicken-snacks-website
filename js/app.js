import { auth, db } from "./firebase-config.js";
import { getCart, saveCart } from "./cart-store.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

const BRAND = { name: "Chicken GRAY", symbol: "CG" };

const PRODUCTS = [
  { id: 1, name: "Chicken 65", category: "chicken", categoryLabel: "Chicken GRAY", description: "Crispy, spicy chicken bites made fresh.", price: 199, emoji: "🍗" },
  { id: 2, name: "Pepper Chicken", category: "chicken", categoryLabel: "Chicken GRAY", description: "Juicy chicken tossed with pepper & herbs.", price: 210, emoji: "🍖" },
  { id: 3, name: "Chicken Wings", category: "chicken", categoryLabel: "Chicken GRAY", description: "Golden wings with a flavourful coating.", price: 190, emoji: "🍗" },
  { id: 4, name: "Masala Chicken", category: "chicken", categoryLabel: "Chicken GRAY", description: "Homestyle masala with tender chicken.", price: 220, emoji: "🍲" },
  { id: 5, name: "Murukku", category: "snacks", categoryLabel: "Snacks", description: "Crunchy traditional homemade snack.", price: 90, emoji: "🥨" },
  { id: 6, name: "Mixture", category: "snacks", categoryLabel: "Snacks", description: "Crispy, savoury mix for tea time.", price: 100, emoji: "🥜" },
  { id: 7, name: "Chicken + Snack Box", category: "combos", categoryLabel: "Combo", description: "A satisfying chicken and snack combo.", price: 299, emoji: "🍱" },
  { id: 8, name: "Family Feast", category: "combos", categoryLabel: "Combo", description: "A bigger box made for sharing.", price: 499, emoji: "🍱" }
];

// Expose the single source of truth for the mobile typing-search fallback.
window.customerSearchProducts = PRODUCTS;

// Expose the current menu counts to the mobile app shell so the MENU sheet
// always reflects the products actually present in this customer menu.
window.customerMenuCounts = PRODUCTS.reduce((counts, product) => {
  counts[product.category] = (counts[product.category] || 0) + 1;
  counts.all = (counts.all || 0) + 1;
  return counts;
}, { chicken: 0, snacks: 0, combos: 0, all: 0 });

// Tell the mobile shell that the real customer menu counts are ready.
// This is important on Android/WebView because app.js waits for Firebase
// module dependencies before it finishes evaluating.
window.dispatchEvent(new CustomEvent('customer-menu-counts-ready', {
  detail: { ...window.customerMenuCounts }
}));

let activeFilter = "all";
let highlightedProductId = null;
let cart = [];
let currentUser = null;
let cartLoaded = false;

const $ = id => document.getElementById(id);
const productGrid = $("productGrid");
const emptyState = $("emptyState");
const searchInput = $("searchInput");
const searchSuggestions = $("searchSuggestions");
const searchResults = $("searchResults");
const filterBar = $("filterBar");
const cartButton = $("cartButton");
const heroCartButton = $("heroCartButton");
const stickyCart = $("stickyCart");
const stickyCartCount = $("stickyCartCount");
const stickyCartView = $("stickyCartView");
const cartCount = $("cartCount");
const mobileMenuButton = $("mobileMenuButton");
const mobileNav = $("mobileNav");
const loginButton = $("loginButton");
const mobileSigninLink = document.querySelector(".mobile-signin-link");
const locationText = $("locationText");

$("brandName").textContent = BRAND.name;
$("brandLogo").textContent = BRAND.symbol;

function formatPrice(value) {
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

async function persistCart() {
  if (!currentUser) return false;
  await saveCart(currentUser, cart);
  return true;
}

function getFilteredProducts() {
  return PRODUCTS.filter(product => {
    return activeFilter === "all" || product.category === activeFilter;
  });
}

function findSearchProduct(term) {
  const query = String(term || "").trim().toLowerCase();
  if (!query) return null;

  const searchable = product =>
    `${product.name} ${product.categoryLabel} ${product.description}`.toLowerCase();

  // Prefer an exact product-name match, then a name-start match, then any match.
  return (
    PRODUCTS.find(product => product.name.toLowerCase() === query) ||
    PRODUCTS.find(product => product.name.toLowerCase().startsWith(query)) ||
    PRODUCTS.find(product => searchable(product).includes(query)) ||
    null
  );
}

function highlightSearchProduct(product) {
  highlightedProductId = product ? product.id : null;
  renderProducts();

  if (!product) return;

  const card = productGrid.querySelector(`[data-product-id="${product.id}"]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  } else {
    document.querySelector(".products-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.setTimeout(() => {
    card?.classList.remove("search-highlight-pulse");
    void card?.offsetWidth;
    card?.classList.add("search-highlight-pulse");
  }, 80);
}

function getSearchMatches(term) {
  const query = String(term || "").trim().toLowerCase();
  if (!query) return [];

  const searchable = product =>
    `${product.name} ${product.categoryLabel} ${product.description}`.toLowerCase();

  // Same product-search logic used by the existing menu: prefer name matches,
  // then allow category/description matches. Keep the original product order.
  return PRODUCTS.filter(product => searchable(product).includes(query));
}

function renderSearchResults(term) {
  if (!searchResults) return;

  const matches = getSearchMatches(term);
  if (!String(term || "").trim()) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
    return;
  }

  if (!matches.length) {
    searchResults.innerHTML = `
      <div class="search-result-empty">
        <span>No matching menu items.</span>
      </div>`;
    searchResults.hidden = false;
    return;
  }

  searchResults.innerHTML = matches.map(product => `
    <button type="button" class="search-result-card" data-search-result="${product.id}">
      <span class="search-result-icon">${product.emoji}</span>
      <span class="search-result-copy">
        <strong>${product.name}</strong>
        <small>${product.categoryLabel} · ${formatPrice(product.price)}</small>
      </span>
      <span class="search-result-arrow">→</span>
    </button>
  `).join("");
  searchResults.hidden = false;
}

function renderSearchSuggestions() {
  if (!searchSuggestions) return;

  const term = searchInput.value.trim().toLowerCase();
  if (!term) {
    searchSuggestions.hidden = true;
    searchSuggestions.innerHTML = "";
    return;
  }

  const matches = PRODUCTS.filter(product => {
    const searchable = `${product.name} ${product.categoryLabel} ${product.description}`.toLowerCase();
    return searchable.includes(term);
  }).slice(0, 8);

  if (!matches.length) {
    searchSuggestions.innerHTML = `<div class="search-no-results">No matching menu items.</div>`;
    searchSuggestions.hidden = false;
    return;
  }

  searchSuggestions.innerHTML = matches.map(product => `
    <button type="button" class="search-suggestion" data-suggestion="${product.id}">
      <span class="search-suggestion-icon">${product.emoji}</span>
      <span class="search-suggestion-copy">
        <strong>${product.name}</strong>
        <small>${product.categoryLabel} · ${formatPrice(product.price)}</small>
      </span>
      <span class="search-suggestion-arrow">→</span>
    </button>
  `).join("");
  searchSuggestions.hidden = false;
}

function selectSearchSuggestion(id) {
  const product = PRODUCTS.find(item => item.id === Number(id));
  if (!product) return;
  searchInput.value = product.name;
  activeFilter = "all";
  document.querySelectorAll("[data-filter]").forEach(el => {
    if (el.classList.contains("filter")) el.classList.toggle("active", el.dataset.filter === "all");
  });
  renderSearchSuggestions();
  if (searchSuggestions) searchSuggestions.hidden = true;
  highlightSearchProduct(product);
}

function renderProducts() {
  const products = getFilteredProducts();
  productGrid.innerHTML = products.map(product => `
    <article class="product${highlightedProductId === product.id ? " search-highlight" : ""}" data-product-id="${product.id}" data-product-category="${product.category}">
      <div class="product-image" aria-hidden="true">${product.emoji}</div>
      <div class="product-info">
        <span class="product-tag">${product.categoryLabel}</span>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="product-bottom">
          <span class="product-price">${formatPrice(product.price)}</span>
          ${(() => {
            const quantity = Number(cart.find(item => item.id === product.id)?.quantity || 0);
            return quantity > 0
              ? `<div class="product-qty-control" role="group" aria-label="Quantity for ${product.name}">
                  <button type="button" class="qty-btn qty-minus" data-qty-minus="${product.id}" aria-label="Decrease ${product.name} quantity">−</button>
                  <span class="qty-value">${quantity}</span>
                  <button type="button" class="qty-btn qty-plus" data-qty-plus="${product.id}" aria-label="Increase ${product.name} quantity">+</button>
                </div>`
              : `<button type="button" class="add add-outline" data-add="${product.id}" aria-label="Add ${product.name} to cart">+</button>`;
          })()}
        </div>
      </div>
    </article>
  `).join("");
  emptyState.style.display = products.length ? "none" : "block";
}

function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll("[data-filter]").forEach(el => {
    if (el.classList.contains("filter")) el.classList.toggle("active", el.dataset.filter === filter);
  });
  renderProducts();
}

async function addToCart(id) {
  if (!currentUser) {
    window.location.href = "login.html?redirect=index.html%23menu";
    return;
  }
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;
  const existing = cart.find(item => item.id === id);
  if (existing) existing.quantity += 1;
  else cart.push({ ...product, quantity: 1 });
  try {
    await persistCart();
    renderCart();
    renderProducts();
  } catch (err) {
    console.error("Cart save failed:", err);
    alert("Could not save your cart to Firebase. Please try again.");
  }
}

async function changeQuantity(id, delta) {
  const item = cart.find(p => p.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(p => p.id !== id);
  try {
    await persistCart();
    renderCart();
    renderProducts();
  } catch (err) {
    console.error("Cart update failed:", err);
    alert("Could not update your cart. Please try again.");
  }
}

function renderCart() {
  const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  cartCount.textContent = totalItems;

  if (!stickyCart || !stickyCartCount) return;

  const itemLabel = totalItems === 1 ? "1 Item added" : `${totalItems} Items added`;
  stickyCartCount.textContent = itemLabel;
  stickyCart.hidden = totalItems === 0;
}


productGrid.addEventListener("click", e => {
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    addToCart(Number(addBtn.dataset.add));
    return;
  }

  const plusBtn = e.target.closest("[data-qty-plus]");
  if (plusBtn) {
    addToCart(Number(plusBtn.dataset.qtyPlus));
    return;
  }

  const minusBtn = e.target.closest("[data-qty-minus]");
  if (minusBtn) {
    changeQuantity(Number(minusBtn.dataset.qtyMinus), -1);
  }
});
filterBar.addEventListener("click", e => {
  const btn = e.target.closest("[data-filter]");
  if (btn) setFilter(btn.dataset.filter);
});
document.querySelectorAll(".category-card").forEach(btn => {
  btn.addEventListener("click", () => {
    setFilter(btn.dataset.filter);
    document.querySelector(".products-section").scrollIntoView({ behavior: "smooth" });
  });
});
$("specialButton").addEventListener("click", () => {
  setFilter("combos");
  document.querySelector(".products-section").scrollIntoView({ behavior: "smooth" });
});
function performSearch() {
  const term = searchInput.value.trim();

  if (!term) {
    highlightedProductId = null;
    if (searchResults) {
      searchResults.hidden = true;
      searchResults.innerHTML = "";
    }
    renderProducts();
    searchInput.focus();
    return;
  }

  activeFilter = "all";
  highlightedProductId = null;
  document.querySelectorAll("[data-filter]").forEach(el => {
    if (el.classList.contains("filter")) {
      el.classList.toggle("active", el.dataset.filter === "all");
    }
  });

  if (searchSuggestions) searchSuggestions.hidden = true;
  renderSearchResults(term);

  // Keep the existing Popular today/menu section unchanged. The search result
  // is displayed immediately below the search bar, matching the mobile layout.
  searchResults?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

window.addEventListener('mobile-menu-filter', event => {
  if (event.detail?.filter !== 'all') return;
  activeFilter = 'all';
  document.querySelectorAll('[data-filter]').forEach(el => {
    if (el.classList.contains('filter')) el.classList.toggle('active', el.dataset.filter === 'all');
  });
  renderProducts();
});

$("searchButton").addEventListener("click", performSearch);
searchInput.addEventListener("input", () => {
  // Show related menu items immediately while the customer types.
  // This matches the Android search-results layout: the list appears
  // directly below the search bar without requiring the Search button.
  const term = searchInput.value.trim();

  highlightedProductId = null;

  if (searchSuggestions) {
    searchSuggestions.hidden = true;
    searchSuggestions.innerHTML = "";
  }

  if (!term) {
    if (searchResults) {
      searchResults.hidden = true;
      searchResults.innerHTML = "";
    }
    return;
  }

  activeFilter = "all";
  document.querySelectorAll("[data-filter]").forEach(el => {
    if (el.classList.contains("filter")) {
      el.classList.toggle("active", el.dataset.filter === "all");
    }
  });

  renderSearchResults(term);
});

searchSuggestions?.addEventListener("click", e => {
  const button = e.target.closest("[data-suggestion]");
  if (button) selectSearchSuggestion(button.dataset.suggestion);
});

searchResults?.addEventListener("click", e => {
  const button = e.target.closest("[data-search-result]");
  if (!button) return;

  const product = PRODUCTS.find(item => item.id === Number(button.dataset.searchResult));
  if (!product) return;

  // Selecting a result keeps the existing menu/filter behavior available.
  highlightedProductId = product.id;
  activeFilter = "all";
  renderProducts();
  searchResults.hidden = true;
  document.querySelector(".products-section")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const card = productGrid.querySelector(`[data-product-id="${product.id}"]`);
  card?.classList.add("search-highlight-pulse");
});

document.addEventListener("click", e => {
  if (searchSuggestions && !searchSuggestions.hidden && !searchSuggestions.contains(e.target) && !searchInput.contains(e.target)) {
    searchSuggestions.hidden = true;
  }
});

searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    performSearch();
    return;
  }
  if (e.key === "Escape") {
    if (searchSuggestions) searchSuggestions.hidden = true;
    searchInput.blur();
  }
});
cartButton?.addEventListener("click", () => {
  if (cart.length) window.location.href = "checkout.html";
  else document.querySelector("#menu")?.scrollIntoView({ behavior: "smooth" });
});
heroCartButton?.addEventListener("click", () => {
  if (cart.length) window.location.href = "checkout.html";
  else document.querySelector("#menu")?.scrollIntoView({ behavior: "smooth" });
});
stickyCartView?.addEventListener("click", () => {
  if (cart.length) window.location.href = "checkout.html";
});
mobileMenuButton.addEventListener("click", () => mobileNav.classList.toggle("open"));
mobileNav.querySelectorAll("a").forEach(a => a.addEventListener("click", e => {
  if (!a.classList.contains("mobile-signin-link")) {
    mobileNav.classList.remove("open");
  }
}));

async function signOutFromHome(e) {
  e?.preventDefault();

  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  try {
    // Keep the desktop header Account button separate from the mobile
    // menu Sign out action. Only the mobile menu item changes state here.
    if (mobileSigninLink) mobileSigninLink.textContent = "Signing out…";
    await signOut(auth);
    window.location.href = "index.html";
  } catch (err) {
    console.error("Sign out failed:", err);
    if (mobileSigninLink) mobileSigninLink.textContent = "Sign out";
    alert("Could not sign out. Please try again.");
  }
}

mobileSigninLink?.addEventListener("click", e => {
  if (currentUser) {
    signOutFromHome(e);
    mobileNav.classList.remove("open");
  }
});

// Always start the header with the requested caption.
// A location is shown here only after the user selects/saves it during the current session.
if (locationText) {
  locationText.textContent = "Enter the Location";
  locationText.title = "Enter the Location";
}

// If already signed in, the desktop header button is an Account shortcut.
// The mobile menu keeps Sign out as a separate action.
onAuthStateChanged(auth, async user => {
  currentUser = user;
  cartLoaded = false;

  if (!user) {
    cart = [];
    cartLoaded = true;
    loginButton.textContent = "Sign in";
    loginButton.href = "login.html";
    if (mobileSigninLink) {
      mobileSigninLink.textContent = "Sign in";
      mobileSigninLink.href = "login.html";
    }
    if (locationText) {
      locationText.textContent = "Enter the Location";
      locationText.title = "Enter the Location";
    }
    renderCart();
    return;
  }

  // Desktop header: Account opens the user's account page.
  // Mobile menu: Sign out remains a separate action.
  loginButton.textContent = "Account";
  loginButton.href = "dashboard.html";
  if (mobileSigninLink) {
    mobileSigninLink.textContent = "Sign out";
    mobileSigninLink.href = "#";
  }

  if (locationText) {
    locationText.textContent = "Enter the Location";
    locationText.title = "Enter the Location";
  }

  try {
    cart = await getCart(user);
  } catch (err) {
    console.error("Firebase cart load failed:", err);
    cart = [];
    alert("Could not load your cart from Firebase.");
  } finally {
    cartLoaded = true;
    renderCart();
  }
});

renderProducts();
renderCart();
