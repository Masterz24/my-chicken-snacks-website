// Customer mobile app shell.
// IMPORTANT: this file controls ONLY the customer [USER] experience.
// It keeps the existing visual theme and changes mobile interaction/layout only.

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js';

(() => {
  'use strict';

  const path = window.location.pathname.toLowerCase();
  const isHome = /(?:^|\/)index\.html$/.test(path) || path.endsWith('/');
  const isAccount = path.endsWith('/dashboard.html');
  const isAddress = path.endsWith('/address.html');
  const isCheckout = path.endsWith('/checkout.html');
  const showBottomNav = isHome || isAccount || isAddress || isCheckout;

  function removeLegacyMobileNavigation() {
    // A previously cached build could have injected a bottom "Menu" tab.
    // Always remove/replace that old navigation instead of trusting cached DOM.
    document.querySelectorAll('.mobile-app-bottom-nav').forEach(node => node.remove());
  }

  function addBottomNav() {
    if (!showBottomNav) return;

    removeLegacyMobileNavigation();

    // On the homepage the dedicated Address tab is intentionally removed.
    // Address remains available on Account/Address/Checkout screens.
    const items = isHome
      ? [
          ['Home', '#home', '⌂'],
          ['Orders', 'dashboard.html#order-history', '◷'],
          ['Account', 'dashboard.html#profile', '●'],
          ['Cart', 'checkout.html', '🛒']
        ]
      : [
          ['Home', 'index.html#home', '⌂'],
          ['Orders', 'dashboard.html#order-history', '◷'],
          ['Address', 'address.html', '⌖'],
          ['Account', 'dashboard.html#profile', '●'],
          ['Cart', 'checkout.html', '🛒']
        ];

    const nav = document.createElement('nav');
    nav.className = 'mobile-app-bottom-nav' + (isHome ? ' mobile-app-bottom-nav--home' : '');
    nav.dataset.accountState = 'signed-out';
    nav.setAttribute('aria-label', 'Mobile app navigation');
    nav.innerHTML = items.map(([label, href, icon]) => `
      <a href="${href}" class="mobile-app-nav-item" data-mobile-nav="${label.toLowerCase()}" aria-label="${label}">
        <span class="mobile-app-nav-icon" aria-hidden="true">${icon}</span>
        <span class="mobile-app-nav-label">${label}</span>
      </a>`).join('');

    document.body.appendChild(nav);

    const updateAccountNav = (user) => {
      const accountLink = nav.querySelector('[data-mobile-nav=\"account\"]');
      if (!accountLink) return;

      const signedIn = Boolean(user);
      accountLink.dataset.accountState = signedIn ? 'signed-in' : 'signed-out';
      accountLink.setAttribute('aria-label', signedIn ? 'Account' : 'Sign in');

      const label = accountLink.querySelector('.mobile-app-nav-label');
      if (label) label.textContent = signedIn ? 'Account' : 'Sign in';

      accountLink.href = signedIn ? 'dashboard.html#profile' : 'login.html';
    };

    // Firebase auth is the source of truth. The bottom navigation must show
    // Sign in while signed out and Account after a successful sign-in.
    onAuthStateChanged(auth, updateAccountNav);

    const currentHash = window.location.hash.replace(/^#/, '');
    nav.querySelectorAll('a').forEach(link => {
      const label = link.dataset.mobileNav;
      const active =
        ((isHome || isCheckout) && label === 'home' && !currentHash) ||
        (isAccount && label === 'orders' && currentHash === 'order-history') ||
        ((isAccount && label === 'address' && (currentHash === 'addresses' || currentHash === 'address')) || (isAddress && label === 'address')) ||
        (isAccount && label === 'account' && currentHash === 'profile') ||
        (isCheckout && label === 'cart');
      if (active) link.classList.add('active');

      link.addEventListener('click', event => {
        // When Orders is tapped from My Account, stay on the dashboard and
        // switch the visible panel immediately. This is more reliable on
        // Android WebViews/PWA shells than relying on a same-page hash reload.
        if (isAccount && label === 'orders') {
          event.preventDefault();

          if (typeof window.__openAccountTab === 'function') {
            window.__openAccountTab('order-history');
          } else {
            // Last-resort fallback if auth.js is still initializing.
            document.querySelectorAll('[data-panel]').forEach(panel => {
              panel.classList.toggle('hidden', panel.dataset.panel !== 'order-history');
            });
            document.querySelectorAll('.account-side-item').forEach(item => {
              item.classList.toggle('active', item.dataset.accountTab === 'order-history');
            });
            window.history.replaceState(null, '', '#order-history');
            window.scrollTo({
              top: document.querySelector('.account-layout')?.offsetTop - 70 || 0,
              behavior: 'smooth'
            });
          }

          nav.querySelectorAll('.mobile-app-nav-item').forEach(item =>
            item.classList.toggle('active', item === link)
          );
        }

        document.body.classList.add('mobile-nav-transition');
        window.setTimeout(() => document.body.classList.remove('mobile-nav-transition'), 220);
      }, { passive: false });
    });

    window.addEventListener('account-tab-changed', event => {
      if (!isAccount) return;
      const tab = event.detail?.tab;
      nav.querySelectorAll('.mobile-app-nav-item').forEach(item => {
        const itemLabel = item.dataset.mobileNav;
        item.classList.toggle(
          'active',
          (itemLabel === 'orders' && tab === 'order-history') ||
          (itemLabel === 'account' && tab === 'profile') ||
          (itemLabel === 'address' && (tab === 'addresses' || tab === 'address'))
        );
      });
    });
  }

  function addItemsMenu() {
    if (!isHome) return;
    document.querySelectorAll('.mobile-items-fab, .mobile-items-sheet, .mobile-items-backdrop').forEach(node => node.remove());

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'mobile-items-fab';
    fab.setAttribute('aria-label', 'Open menu');
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = '<span class="mobile-items-fab-icon" aria-hidden="true">☰</span><span>MENU</span>';

    const backdrop = document.createElement('div');
    backdrop.className = 'mobile-items-backdrop';
    backdrop.hidden = true;

    const sheet = document.createElement('section');
    sheet.className = 'mobile-items-sheet';
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'mobileItemsTitle');
    sheet.innerHTML = `
      <div class="mobile-items-handle" aria-hidden="true"></div>
      <div class="mobile-items-head">
        <h2 id="mobileMenuTitle">Menu</h2>
        <button type="button" class="mobile-items-close" aria-label="Close menu">×</button>
      </div>
      <div class="mobile-items-list">
        <button type="button" class="mobile-item-row" data-item-filter="chicken">
          <span>Chicken GRAY</span><b data-menu-count="chicken">0</b>
        </button>
        <button type="button" class="mobile-item-row" data-item-filter="snacks">
          <span>SNACKS</span><b data-menu-count="snacks">0</b>
        </button>
        <button type="button" class="mobile-item-row" data-item-filter="combos">
          <span>COMBO BOXES</span><b data-menu-count="combos">0</b>
        </button>
        <button type="button" class="mobile-item-row mobile-item-row--all" data-item-filter="all">
          <span>ALL ITEMS</span><b data-menu-count="all">0</b>
        </button>
      </div>`;

    document.body.append(fab, backdrop, sheet);

    // Keep the menu counts synchronized with the products actually available
    // in the customer menu. This avoids hard-coded/stale numbers.
    const updateMenuCounts = () => {
      const counts = window.customerMenuCounts;
      if (!counts) return false;

      let hasRealCount = false;
      let total = 0;
      ['chicken', 'snacks', 'combos'].forEach(category => {
        const counter = sheet.querySelector(`[data-menu-count="${category}"]`);
        const value = Number(counts[category]);
        if (Number.isFinite(value) && value >= 0) {
          if (value > 0) hasRealCount = true;
          total += value;
          if (counter) counter.textContent = String(value);
        }
      });
      const allCounter = sheet.querySelector('[data-menu-count="all"]');
      if (allCounter) allCounter.textContent = String(total);
      return hasRealCount;
    };

    // app.js is a module and its Firebase imports can finish after this
    // mobile shell starts. Do not permanently capture the initial zero values.
    // Re-sync when app.js publishes the counts and also retry briefly as a
    // fallback for slow Android/WebView connections.
    const syncMenuCounts = () => updateMenuCounts();
    window.addEventListener('customer-menu-counts-ready', syncMenuCounts);

    let countAttempts = 0;
    const countTimer = window.setInterval(() => {
      countAttempts += 1;
      if (updateMenuCounts() || countAttempts >= 100) {
        window.clearInterval(countTimer);
      }
    }, 50);

    // If the product grid is rendered after this shell, keep the displayed
    // counts synchronized with the current customer menu.
    const productGrid = document.getElementById('productGrid');
    if (productGrid && 'MutationObserver' in window) {
      const observer = new MutationObserver(() => {
        if (window.customerMenuCounts) updateMenuCounts();
      });
      observer.observe(productGrid, { childList: true });
    }

    const close = () => {
      sheet.hidden = true;
      backdrop.hidden = true;
      fab.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('mobile-items-open');
    };
    const open = () => {
      sheet.hidden = false;
      backdrop.hidden = false;
      fab.setAttribute('aria-expanded', 'true');
      document.body.classList.add('mobile-items-open');
    };

    fab.addEventListener('click', open);
    backdrop.addEventListener('click', close);
    sheet.querySelector('.mobile-items-close')?.addEventListener('click', close);

    sheet.addEventListener('click', event => {
      const row = event.target.closest('[data-item-filter]');
      if (!row) return;
      const filter = row.dataset.itemFilter || 'all';
      const target = document.querySelector(`.filter[data-filter="${filter}"]`);
      if (target) {
        target.click();
      } else if (filter === 'all') {
        window.dispatchEvent(new CustomEvent('mobile-menu-filter', { detail: { filter: 'all' } }));
      }
      close();
      requestAnimationFrame(() => {
        document.querySelector('.products-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !sheet.hidden) close();
    });
  }

  function makeLocationTriggerReliable() {
    const trigger = document.getElementById('locationTrigger');
    const modal = document.getElementById('locationModal');
    const overlay = document.getElementById('locationOverlay');
    if (!trigger || !modal || !overlay) return;

    const fallbackOpen = event => {
      // location.js owns the real flow. This fallback is only for cases where
      // that module failed to load (for example a transient mobile cache/network issue).
      if (window.__customerLocationModuleReady) return;
      event.preventDefault();
      modal.hidden = false;
      overlay.hidden = false;
      document.body.classList.add('location-modal-open');
      document.body.style.overflow = 'hidden';

      const loginRequired = document.getElementById('locationLoginRequired');
      const permission = document.getElementById('locationPermission');
      if (loginRequired) loginRequired.hidden = false;
      if (permission) permission.hidden = true;
    };
    trigger.addEventListener('click', fallbackOpen, { passive: false });
  }

  function enableTouchFeedback() {
    document.addEventListener('pointerdown', event => {
      const target = event.target.closest('button, a, .category-card, .product, .payment-option');
      target?.classList.add('mobile-pressed');
    }, { passive: true });
    document.addEventListener('pointerup', () => {
      document.querySelectorAll('.mobile-pressed').forEach(el => el.classList.remove('mobile-pressed'));
    }, { passive: true });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js?v=20260828-keyboard-nav-menu-2', { scope: './' }).catch(error => {
        console.warn('Customer app service worker registration failed:', error);
      });
    });
  }

  function setupMobileTypingSearch() {
    if (!isHome) return;

    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    const suggestions = document.getElementById('searchSuggestions');
    if (!input || !results) return;

    // This listener is deliberately installed by the mobile shell as well as
    // app.js. Android WebView/service-worker caching can otherwise leave an
    // older app.js active while the rest of the new page is already visible.
    // The data comes from app.js so there is only one menu source of truth.
    const getProducts = () => Array.isArray(window.customerSearchProducts)
      ? window.customerSearchProducts
      : [];

    const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));

    const formatPrice = value => `₹${Number(value).toLocaleString('en-IN')}`;

    const render = () => {
      const term = input.value.trim().toLowerCase();
      if (!term) {
        results.hidden = true;
        results.innerHTML = '';
        return;
      }

      const matches = getProducts().filter(product => {
        const searchable = `${product.name} ${product.categoryLabel} ${product.description}`.toLowerCase();
        return searchable.includes(term);
      });

      if (!matches.length) {
        results.innerHTML = '<div class="search-result-empty"><span>No matching menu items.</span></div>';
        results.hidden = false;
        return;
      }

      results.innerHTML = matches.map(product => `
        <button type="button" class="search-result-card" data-search-result="${product.id}">
          <span class="search-result-icon">${escapeHtml(product.emoji)}</span>
          <span class="search-result-copy">
            <strong>${escapeHtml(product.name)}</strong>
            <small>${escapeHtml(product.categoryLabel)} · ${formatPrice(product.price)}</small>
          </span>
          <span class="search-result-arrow">→</span>
        </button>
      `).join('');
      results.hidden = false;
    };

    input.addEventListener('input', render, { passive: true });

    // Make the fallback result row behave exactly like the main app result.
    results.addEventListener('click', event => {
      const button = event.target.closest('[data-search-result]');
      if (!button) return;
      const id = Number(button.dataset.searchResult);
      const product = getProducts().find(item => Number(item.id) === id);
      if (!product) return;

      input.value = product.name;
      results.hidden = true;
      results.innerHTML = '';
      document.querySelector('.products-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const card = document.querySelector(`[data-product-id="${id}"]`);
      card?.classList.add('search-highlight-pulse');
      window.setTimeout(() => card?.classList.remove('search-highlight-pulse'), 1400);
    });

    // Keep only the actual typing-results list visible in the mobile app.
    if (suggestions) {
      suggestions.hidden = true;
      suggestions.innerHTML = '';
    }
  }

  function setupMobileSearchBehavior() {
    if (!isHome) return;
    const panel = document.querySelector('.search-panel');
    const header = document.querySelector('.header');
    if (!panel) return;

    // Android-style behavior:
    // - At the original position: Location + Search are both visible.
    // - Scrolling away from the original position: Search becomes visible
    //   directly below the header, even for a very small scroll movement.
    // - Search stays visible while the user remains away from the original
    //   position.
    // - Once the original position is reached: Location + Search are restored.
    let lastScrollY = Math.max(0, window.scrollY || 0);
    let ticking = false;
    let originalTop = 0;
    let searchPinned = false;

    const measure = () => {
      panel.classList.remove('mobile-search-search-only', 'mobile-search-hidden');
      panel.style.removeProperty('--mobile-search-top');
      panel.style.removeProperty('--mobile-search-width');
      panel.style.removeProperty('--mobile-search-height');
      const rect = panel.getBoundingClientRect();
      originalTop = rect.top + window.scrollY;
    };

    const getHeaderHeight = () => {
      const rect = header?.getBoundingClientRect();
      return Math.max(0, Math.ceil(rect?.height || 82));
    };

    const showBothAtOriginalPosition = () => {
      panel.classList.remove('mobile-search-hidden', 'mobile-search-search-only');
      panel.style.removeProperty('--mobile-search-top');
      panel.style.removeProperty('--mobile-search-width');
      panel.style.removeProperty('--mobile-search-height');
    };

    const hidePanel = () => {
      panel.classList.remove('mobile-search-search-only');
      panel.classList.add('mobile-search-hidden');
      panel.style.removeProperty('--mobile-search-top');
      panel.style.removeProperty('--mobile-search-width');
      panel.style.removeProperty('--mobile-search-height');
    };

    const showSearchOnly = () => {
      const headerHeight = getHeaderHeight();
      const search = panel.querySelector('.search');
      const panelRect = panel.getBoundingClientRect();
      const width = Math.round(panelRect.width || panel.parentElement?.getBoundingClientRect().width || window.innerWidth);
      const searchHeight = Math.ceil(search?.getBoundingClientRect().height || 54);

      panel.classList.remove('mobile-search-hidden');
      panel.classList.add('mobile-search-search-only');
      panel.style.setProperty('--mobile-search-top', `${headerHeight}px`);
      panel.style.setProperty('--mobile-search-width', `${width}px`);
      panel.style.setProperty('--mobile-search-height', `${searchHeight + 16}px`);
    };

    const applyScrollState = () => {
      ticking = false;
      const currentY = Math.max(0, window.scrollY || 0);
      const delta = currentY - lastScrollY;
      const headerHeight = getHeaderHeight();
      const releasePoint = Math.max(0, originalTop - headerHeight - 4);

      // Always restore the original two-row panel when we are back at/near
      // its natural document position.
      if (currentY <= 12 || currentY <= releasePoint) {
        searchPinned = false;
        showBothAtOriginalPosition();
      } else if (Math.abs(delta) > 0) {
        // From anywhere below the original position, ANY scroll movement —
        // even a single pixel — makes the Search bar visible. This is
        // intentionally direction-independent so it also works immediately
        // when the user makes a tiny movement at the footer or near the
        // bottom of the page.
        searchPinned = true;
        showSearchOnly();
      } else if (searchPinned) {
        // Keep Search visible while it is pinned.
        showSearchOnly();
      }

      lastScrollY = currentY;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(applyScrollState);
    };

    const onResize = () => {
      measure();
      const currentY = Math.max(0, window.scrollY || 0);
      if (currentY <= 12 || currentY <= Math.max(0, originalTop - getHeaderHeight() - 4)) {
        searchPinned = false;
        showBothAtOriginalPosition();
      } else if (searchPinned) {
        showSearchOnly();
      }
    };

    measure();
    window.addEventListener('load', measure, { once: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function setupAccountBackToHome() {
    if (!isAccount) return;

    // My Account is a terminal customer screen in the mobile app: Android
    // Back, Android edge-swipe, and browser history Back must always return
    // to Home. This deliberately ignores dashboard hash/tab history.
    let navigatingHome = false;

    const goHome = () => {
      if (navigatingHome) return;
      navigatingHome = true;
      window.location.replace('index.html');
    };

    // Expose the same action for the native Android WebView handler if the
    // page is reached with a reduced/empty WebView history stack.
    window.__accountBackToHome = goHome;

    window.addEventListener('popstate', () => {
      if (window.__handleAndroidBack?.()) return;
      goHome();
    });
  }

  function setupCartAwareMenuPosition() {
    if (!isHome) return;
    const fab = document.querySelector('.mobile-items-fab');
    const stickyCart = document.getElementById('stickyCart');
    if (!fab || !stickyCart) return;

    const sync = () => {
      fab.classList.toggle('mobile-items-fab--with-cart', !stickyCart.hidden);
    };

    sync();
    if ('MutationObserver' in window) {
      const observer = new MutationObserver(sync);
      observer.observe(stickyCart, { attributes: true, attributeFilter: ['hidden', 'class'] });
    }
  }

  function setupMobileKeyboardVisibility() {
    // Hide the fixed bottom navigation and the floating MENU while the Android
    // soft keyboard is actually visible.  Important: do NOT use :focus as the
    // permanent state because Android can close the keyboard while the input
    // remains focused.  visualViewport/native IME insets are used to restore
    // the controls immediately when the keyboard disappears.
    const nav = document.querySelector('.mobile-app-bottom-nav');
    const menuFab = document.querySelector('.mobile-items-fab');
    if (!nav && !menuFab) return;

    const body = document.body;
    const viewport = window.visualViewport;
    let nativeKeyboardState = null;
    let baselineHeight = Math.max(
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
      viewport?.height || 0
    );
    let focusedEditable = false;
    let polling = false;

    const isEditable = element => {
      if (!element) return false;
      const tag = element.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
    };

    const setHidden = hidden => {
      body.classList.toggle('mobile-keyboard-open', hidden);
      nav?.setAttribute('aria-hidden', hidden ? 'true' : 'false');
      menuFab?.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    };

    const getKeyboardGap = () => {
      const innerHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const viewportHeight = viewport?.height || innerHeight;
      const viewportGap = Math.max(0, innerHeight - viewportHeight);
      const baselineGap = Math.max(0, baselineHeight - viewportHeight);
      return Math.max(viewportGap, baselineGap);
    };

    const update = () => {
      const gap = getKeyboardGap();
      const keyboardByViewport = gap > 100;

      // Native Android is authoritative when the app bridge is available.
      // Otherwise use the visualViewport/height signal.
      const keyboardOpen = nativeKeyboardState === true ||
        (nativeKeyboardState !== false && keyboardByViewport);

      setHidden(Boolean(keyboardOpen));

      // Keep checking while an editable field is focused. This handles
      // Android WebView versions that deliver the final visualViewport resize
      // a little later than the IME animation.
      if (focusedEditable && !polling) {
        polling = true;
        let ticks = 0;
        const poll = () => {
          polling = false;
          update();
          ticks += 1;
          if (focusedEditable && ticks < 20) {
            window.setTimeout(() => {
              if (!polling) {
                polling = true;
                poll();
              }
            }, 100);
          }
        };
        window.setTimeout(poll, 40);
      }
    };

    // Android MainActivity reports IME visibility here. This is what makes
    // Back/gesture keyboard dismissal immediately restore the navigation even
    // when the focused input itself does not blur.
    window.__setNativeKeyboardVisible = visible => {
      nativeKeyboardState = Boolean(visible);
      if (!visible) {
        baselineHeight = Math.max(
          window.innerHeight || 0,
          document.documentElement.clientHeight || 0,
          viewport?.height || 0
        );
      }
      setHidden(Boolean(visible));
      update();
    };

    document.addEventListener('focusin', event => {
      if (!isEditable(event.target)) return;
      focusedEditable = true;
      setHidden(true);
      update();
    }, { passive: true });

    document.addEventListener('focusout', event => {
      if (!isEditable(event.target)) return;
      focusedEditable = false;
      // Do not force the nav visible here. The keyboard may still be closing;
      // visualViewport/native IME state decides when it is safe to restore it.
      window.setTimeout(update, 40);
      window.setTimeout(update, 160);
      window.setTimeout(update, 350);
    }, { passive: true });

    viewport?.addEventListener('resize', update, { passive: true });
    viewport?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });

    // A periodic lightweight check also covers older Android WebViews where
    // visualViewport resize events can be delayed during IME animations.
    window.setInterval(() => {
      if (focusedEditable || body.classList.contains('mobile-keyboard-open')) update();
    }, 250);

    update();
  }

  function setupAndroidBackNavigation() {
    // Expose a synchronous back-action hook for the native Android WebView.
    // Android Back and edge-swipe must behave exactly like tapping the visible
    // X/close control for temporary homepage UI (Menu, location dialog,
    // search suggestions, and the keyboard). Native Android calls this hook
    // before deciding whether the WebView should navigate or the Activity
    // should finish. Returning true means the current page consumed Back.
    window.__handleAndroidBack = () => {
      const menuSheet = document.querySelector('.mobile-items-sheet');
      if (menuSheet && !menuSheet.hidden) {
        document.querySelector('.mobile-items-close')?.click();
        if (!menuSheet.hidden) {
          menuSheet.hidden = true;
          document.querySelector('.mobile-items-backdrop')?.setAttribute('hidden', '');
          document.querySelector('.mobile-items-fab')?.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('mobile-items-open');
        }
        return true;
      }

      const locationModal = document.getElementById('locationModal');
      if (locationModal && !locationModal.hidden) {
        document.getElementById('locationClose')?.click();
        if (!locationModal.hidden) locationModal.hidden = true;
        document.getElementById('locationOverlay')?.setAttribute('hidden', '');
        document.body.classList.remove('location-modal-open');
        document.body.style.removeProperty('overflow');
        return true;
      }

      const suggestions = document.getElementById('searchSuggestions');
      if (suggestions && !suggestions.hidden) {
        suggestions.hidden = true;
        return true;
      }

      // On the homepage, if an input/search field owns focus, Back should
      // dismiss the keyboard first rather than navigating away.
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase();
      if (active && (tag === 'input' || tag === 'textarea' || tag === 'select' || active.isContentEditable)) {
        active.blur();
        return true;
      }

      return false;
    };

    // Android Back and Android edge-swipe both eventually operate on the
    // WebView/browser history.  A normal multi-page website can therefore
    // close the Activity when the current document is the last history entry.
    //
    // For the customer app we intentionally give the important screens a
    // deterministic Android Back destination instead of allowing the Activity
    // to finish:
    //   checkout.html      -> index.html
    //   login.html         -> index.html
    //   signup.html        -> login.html
    //   dashboard.html     -> index.html
    //   address.html       -> dashboard.html
    //   forgot-password    -> login.html
    //   reset-password     -> login.html
    //   verify-otp.html    -> forgot-password.html
    //
    // The extra history entry is invisible to the user. Android Back pops that
    // entry, fires popstate, and we replace the current document with the
    // intended destination. This also works with gesture navigation when the
    // Android WebView delegates Back to its history.
    const pageName = window.location.pathname.split('/').pop().toLowerCase();
    const backTargets = {
      'checkout.html': 'index.html',
      'login.html': 'index.html',
      'signup.html': 'login.html',
      'dashboard.html': 'index.html',
      'address.html': 'dashboard.html',
      'forgot-password.html': 'login.html',
      'reset-password.html': 'login.html',
      'verify-otp.html': 'forgot-password.html'
    };

    const target = backTargets[pageName];
    const isHome = /(?:^|\/)index\.html$/.test(window.location.pathname) || window.location.pathname.endsWith('/');
    const androidGuardKey = '__chickenGrayAndroidBackGuard';

    // Homepage is intentionally a terminal Android destination. MainActivity
    // detects the Home URL and finishes the Activity for Android Back / edge
    // swipe. Do not add a fake history guard here.

    if (target) {
      const currentState = window.history.state;
      const alreadyGuarded = currentState && currentState[androidGuardKey] === target;

      if (!alreadyGuarded) {
        window.history.replaceState(
          {
            ...(currentState && typeof currentState === 'object' ? currentState : {}),
            [androidGuardKey]: target,
            __chickenGrayAndroidPage: pageName
          },
          '',
          window.location.href
        );
        window.history.pushState(
          { __chickenGrayAndroidBack: target, __chickenGrayAndroidPage: pageName },
          '',
          window.location.href
        );
      }
    }

    window.addEventListener('popstate', () => {
      // Keep browser-history Back consistent with the native Android Back hook.
      if (window.__handleAndroidBack?.()) return;

      const state = window.history.state || {};
      const guardedTarget = state.__chickenGrayAndroidBack || state[androidGuardKey];

      if (guardedTarget) {
        // Replace instead of assigning so Back does not leave the current
        // checkout/login/account page behind the destination.
        window.location.replace(guardedTarget);
        return;
      }

      if (isHome) {
        // Native Android handles Home Back and finishes the Activity.
        return;
      }
    });
  }

  function init() {
    document.documentElement.classList.add('mobile-app-ready');
    addBottomNav();
    addItemsMenu();
    setupMobileTypingSearch();
    setupMobileSearchBehavior();
    setupCartAwareMenuPosition();
    setupMobileKeyboardVisibility();
    makeLocationTriggerReliable();
    setupAndroidBackNavigation();
    setupAccountBackToHome();
    enableTouchFeedback();
    registerServiceWorker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
