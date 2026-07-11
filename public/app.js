/* ===================================================
   Wedding Diary — frontend app logic
   Talks to the Express API in ../server.js. Data is
   persisted server-side (data/db.json), scoped per account.
=================================================== */

(function () {
  "use strict";

  const API = "/api";
  const TOKEN_KEY = "weddingDiaryToken";

  // preview fields shown at a glance on each card face
  const PREVIEW_FIELD_LABELS = ["Venue", "Budget", "Guest Count"];

  // ---------- state ----------
  let events = [];
  let currentUser = null;
  let activeEventId = null;
  let pendingDeleteId = null;

  // ---------- DOM refs ----------
  const authScreen = document.getElementById("authScreen");
  const appScreen = document.getElementById("appScreen");

  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const authError = document.getElementById("authError");
  const loginSubmit = document.getElementById("loginSubmit");
  const registerSubmit = document.getElementById("registerSubmit");

  const currentUserName = document.getElementById("currentUserName");
  const logoutBtn = document.getElementById("logoutBtn");

  const board = document.getElementById("board");
  const boardStatus = document.getElementById("boardStatus");
  const emptyState = document.getElementById("emptyState");
  const emptyStateBtn = document.getElementById("emptyStateBtn");

  const newEventBtn = document.getElementById("newEventBtn");
  const newEventOverlay = document.getElementById("newEventOverlay");
  const newEventInput = document.getElementById("newEventInput");
  const cancelNewEvent = document.getElementById("cancelNewEvent");
  const confirmNewEvent = document.getElementById("confirmNewEvent");

  const detailOverlay = document.getElementById("detailOverlay");
  const detailTitle = document.getElementById("detailTitle");
  const detailKicker = document.getElementById("detailKicker");
  const ledgerRows = document.getElementById("ledgerRows");
  const closeDetail = document.getElementById("closeDetail");
  const deleteEventBtn = document.getElementById("deleteEventBtn");

  const addFieldBtn = document.getElementById("addFieldBtn");
  const addRowForm = document.getElementById("addRowForm");
  const newFieldLabel = document.getElementById("newFieldLabel");
  const newFieldValue = document.getElementById("newFieldValue");
  const saveFieldBtn = document.getElementById("saveFieldBtn");
  const cancelFieldBtn = document.getElementById("cancelFieldBtn");

  const confirmOverlay = document.getElementById("confirmOverlay");
  const confirmText = document.getElementById("confirmText");
  const cancelConfirm = document.getElementById("cancelConfirm");
  const confirmDelete = document.getElementById("confirmDelete");

  // ---------- helpers ----------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function findEvent(id) { return events.find((e) => e.id === id) || null; }
  function openOverlay(el) { el.hidden = false; }
  function closeOverlay(el) { el.hidden = true; }

  function showStatus(msg) {
    boardStatus.textContent = msg;
    boardStatus.hidden = false;
  }
  function hideStatus() { boardStatus.hidden = true; }

  async function api(path, options = {}) {
    const token = getToken();
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      options.headers || {},
      token ? { Authorization: "Bearer " + token } : {}
    );

    let res;
    try {
      res = await fetch(API + path, { ...options, headers });
    } catch (networkErr) {
      throw new Error("Can't reach the server. Check that it's running and try again.");
    }

    if (res.status === 204) return null;

    let body = null;
    try { body = await res.json(); } catch (e) { /* no body */ }

    if (!res.ok) {
      if (res.status === 401) {
        // token missing/expired — send back to sign-in
        clearToken();
        showAuthScreen();
      }
      throw new Error((body && body.error) || "Something went wrong.");
    }
    return body;
  }

  // ===================================================
  // AUTH
  // ===================================================

  function setAuthTab(tab) {
    const isLogin = tab === "login";
    tabLogin.classList.toggle("is-active", isLogin);
    tabRegister.classList.toggle("is-active", !isLogin);
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    authError.hidden = true;
  }

  tabLogin.addEventListener("click", () => setAuthTab("login"));
  tabRegister.addEventListener("click", () => setAuthTab("register"));

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.hidden = false;
  }

  function showAuthScreen() {
    currentUser = null;
    events = [];
    authScreen.hidden = false;
    appScreen.hidden = true;
  }

  function showAppScreen() {
    authScreen.hidden = true;
    appScreen.hidden = false;
    currentUserName.textContent = currentUser ? `Signed in as ${currentUser.name}` : "";
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.hidden = true;
    loginSubmit.disabled = true;
    loginSubmit.textContent = "Signing in…";
    try {
      const email = document.getElementById("loginEmail").value;
      const password = document.getElementById("loginPassword").value;
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(data.token);
      currentUser = data.user;
      await loadEvents();
      showAppScreen();
      loginForm.reset();
    } catch (err) {
      showAuthError(err.message);
    } finally {
      loginSubmit.disabled = false;
      loginSubmit.textContent = "Sign in";
    }
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.hidden = true;
    registerSubmit.disabled = true;
    registerSubmit.textContent = "Creating account…";
    try {
      const name = document.getElementById("registerName").value;
      const email = document.getElementById("registerEmail").value;
      const password = document.getElementById("registerPassword").value;
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      });
      setToken(data.token);
      currentUser = data.user;
      await loadEvents();
      showAppScreen();
      registerForm.reset();
    } catch (err) {
      showAuthError(err.message);
    } finally {
      registerSubmit.disabled = false;
      registerSubmit.textContent = "Create account";
    }
  });

  logoutBtn.addEventListener("click", () => {
    clearToken();
    showAuthScreen();
    setAuthTab("login");
  });

  async function tryRestoreSession() {
    const token = getToken();
    if (!token) { showAuthScreen(); return; }
    try {
      const data = await api("/auth/me");
      currentUser = data.user;
      await loadEvents();
      showAppScreen();
    } catch (err) {
      clearToken();
      showAuthScreen();
    }
  }

  // ===================================================
  // EVENTS DATA
  // ===================================================

  async function loadEvents() {
    try {
      const data = await api("/events");
      events = data.events;
      hideStatus();
    } catch (err) {
      showStatus(err.message);
    }
    renderBoard();
  }

  // ---------- rendering: board ----------
  function renderBoard() {
    board.innerHTML = "";
    emptyState.hidden = events.length !== 0;

    events.forEach((ev) => {
      const card = document.createElement("article");
      card.className = "event-card";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Open " + ev.name);

      const filledCount = ev.fields.filter((f) => f.value.trim() !== "").length;

      const previewRows = PREVIEW_FIELD_LABELS
        .map((label) => ev.fields.find((f) => f.label === label))
        .filter(Boolean)
        .map((f) => {
          const hasValue = f.value.trim() !== "";
          return `
            <div class="preview-row">
              <span class="preview-label">${escapeHtml(f.label)}</span>
              <span class="preview-value ${hasValue ? "" : "is-empty"}">${hasValue ? escapeHtml(f.value) : "Not set"}</span>
            </div>`;
        })
        .join("");

      card.innerHTML = `
        <div class="event-card-top">
          <div>
            <h3 class="event-name">${escapeHtml(ev.name)}</h3>
            <span class="event-count">${ev.fields.length} detail${ev.fields.length === 1 ? "" : "s"} &middot; ${filledCount} filled</span>
          </div>
          <button class="card-icon-btn" data-action="delete" title="Delete event" aria-label="Delete event">&#10005;</button>
        </div>
        <div class="event-preview">${previewRows}</div>
        <div class="event-open-hint">Open diary &rarr;</div>
      `;

      card.addEventListener("click", (e) => {
        if (e.target.closest('[data-action="delete"]')) {
          e.stopPropagation();
          askDeleteEvent(ev.id);
          return;
        }
        openDetail(ev.id);
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail(ev.id);
        }
      });

      board.appendChild(card);
    });
  }

  // ---------- rendering: ledger (detail modal) ----------
  function renderLedger() {
    const ev = findEvent(activeEventId);
    if (!ev) return;

    detailKicker.textContent = "Event Diary";
    detailTitle.textContent = ev.name;

    ledgerRows.innerHTML = "";
    ev.fields.forEach((field) => {
      const row = document.createElement("div");
      row.className = "ledger-row";
      row.innerHTML = `
        <span class="row-label">${escapeHtml(field.label)}</span>
        <span class="row-leader"></span>
        <span class="row-value" contenteditable="true" spellcheck="false">${escapeHtml(field.value)}</span>
        <button class="row-delete" title="Remove detail" aria-label="Remove ${escapeHtml(field.label)}">&#10005;</button>
      `;

      const valueEl = row.querySelector(".row-value");
      valueEl.addEventListener("blur", async () => {
        const newValue = valueEl.textContent.trim();
        if (newValue === field.value) return;
        field.value = newValue;
        renderBoard();
        try {
          await api(`/events/${ev.id}/fields/${field.id}`, {
            method: "PUT",
            body: JSON.stringify({ value: newValue })
          });
        } catch (err) {
          showStatus("Couldn't save that change: " + err.message);
        }
      });
      valueEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); valueEl.blur(); }
      });

      row.querySelector(".row-delete").addEventListener("click", async () => {
        const prevFields = ev.fields;
        ev.fields = ev.fields.filter((f) => f.id !== field.id);
        renderLedger();
        renderBoard();
        try {
          await api(`/events/${ev.id}/fields/${field.id}`, { method: "DELETE" });
        } catch (err) {
          ev.fields = prevFields;
          renderLedger();
          renderBoard();
          showStatus("Couldn't remove that detail: " + err.message);
        }
      });

      ledgerRows.appendChild(row);
    });
  }

  // ---------- open / close detail ----------
  function openDetail(id) {
    activeEventId = id;
    renderLedger();
    addRowForm.hidden = true;
    openOverlay(detailOverlay);
  }

  async function closeDetailModal() {
    const ev = findEvent(activeEventId);
    if (ev) {
      const newName = detailTitle.textContent.trim();
      if (newName && newName !== ev.name) {
        ev.name = newName;
        renderBoard();
        try {
          await api(`/events/${ev.id}`, { method: "PUT", body: JSON.stringify({ name: newName }) });
        } catch (err) {
          showStatus("Couldn't save the new name: " + err.message);
        }
      }
    }
    activeEventId = null;
    closeOverlay(detailOverlay);
  }

  detailTitle.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); detailTitle.blur(); }
  });
  detailTitle.addEventListener("blur", async () => {
    const ev = findEvent(activeEventId);
    if (!ev) return;
    const newName = detailTitle.textContent.trim();
    if (!newName) { detailTitle.textContent = ev.name; return; }
    if (newName === ev.name) return;
    ev.name = newName;
    renderBoard();
    try {
      await api(`/events/${ev.id}`, { method: "PUT", body: JSON.stringify({ name: newName }) });
    } catch (err) {
      showStatus("Couldn't save the new name: " + err.message);
    }
  });

  closeDetail.addEventListener("click", closeDetailModal);
  detailOverlay.addEventListener("click", (e) => { if (e.target === detailOverlay) closeDetailModal(); });

  // ---------- add new event ----------
  function openNewEventModal() {
    newEventInput.value = "";
    openOverlay(newEventOverlay);
    setTimeout(() => newEventInput.focus(), 50);
  }
  function closeNewEventModal() { closeOverlay(newEventOverlay); }

  newEventBtn.addEventListener("click", openNewEventModal);
  emptyStateBtn.addEventListener("click", openNewEventModal);
  cancelNewEvent.addEventListener("click", closeNewEventModal);
  newEventOverlay.addEventListener("click", (e) => { if (e.target === newEventOverlay) closeNewEventModal(); });

  async function submitNewEvent() {
    const name = newEventInput.value.trim();
    if (!name) { newEventInput.focus(); return; }
    confirmNewEvent.disabled = true;
    try {
      const data = await api("/events", { method: "POST", body: JSON.stringify({ name }) });
      events.push(data.event);
      closeNewEventModal();
      renderBoard();
      openDetail(data.event.id);
    } catch (err) {
      showStatus("Couldn't create that event: " + err.message);
    } finally {
      confirmNewEvent.disabled = false;
    }
  }

  confirmNewEvent.addEventListener("click", submitNewEvent);
  newEventInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitNewEvent(); });

  // ---------- add custom field ----------
  addFieldBtn.addEventListener("click", () => {
    addRowForm.hidden = false;
    newFieldLabel.value = "";
    newFieldValue.value = "";
    newFieldLabel.focus();
  });
  cancelFieldBtn.addEventListener("click", () => { addRowForm.hidden = true; });

  async function submitNewField() {
    const ev = findEvent(activeEventId);
    if (!ev) return;
    const label = newFieldLabel.value.trim();
    const value = newFieldValue.value.trim();
    if (!label) { newFieldLabel.focus(); return; }
    saveFieldBtn.disabled = true;
    try {
      const data = await api(`/events/${ev.id}/fields`, {
        method: "POST",
        body: JSON.stringify({ label, value })
      });
      ev.fields.push(data.field);
      addRowForm.hidden = true;
      renderLedger();
      renderBoard();
    } catch (err) {
      showStatus("Couldn't add that detail: " + err.message);
    } finally {
      saveFieldBtn.disabled = false;
    }
  }

  saveFieldBtn.addEventListener("click", submitNewField);
  newFieldValue.addEventListener("keydown", (e) => { if (e.key === "Enter") submitNewField(); });
  newFieldLabel.addEventListener("keydown", (e) => { if (e.key === "Enter") newFieldValue.focus(); });

  // ---------- delete event ----------
  function askDeleteEvent(id) {
    pendingDeleteId = id;
    const ev = findEvent(id);
    confirmText.textContent = ev
      ? `Remove "${ev.name}" and all its details? This will permanently delete it from your account.`
      : "This will permanently delete it from your account.";
    openOverlay(confirmOverlay);
  }

  deleteEventBtn.addEventListener("click", () => askDeleteEvent(activeEventId));

  cancelConfirm.addEventListener("click", () => { pendingDeleteId = null; closeOverlay(confirmOverlay); });
  confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) { pendingDeleteId = null; closeOverlay(confirmOverlay); }
  });

  confirmDelete.addEventListener("click", async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    confirmDelete.disabled = true;
    try {
      await api(`/events/${id}`, { method: "DELETE" });
      events = events.filter((e) => e.id !== id);
      if (activeEventId === id) { activeEventId = null; closeOverlay(detailOverlay); }
      pendingDeleteId = null;
      closeOverlay(confirmOverlay);
      renderBoard();
    } catch (err) {
      showStatus("Couldn't delete that event: " + err.message);
    } finally {
      confirmDelete.disabled = false;
    }
  });

  // ---------- global escape key ----------
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!confirmOverlay.hidden) { cancelConfirm.click(); return; }
    if (!newEventOverlay.hidden) { closeNewEventModal(); return; }
    if (!detailOverlay.hidden) { closeDetailModal(); return; }
  });

  // ---------- init ----------
  setAuthTab("login");
  tryRestoreSession();
})();
