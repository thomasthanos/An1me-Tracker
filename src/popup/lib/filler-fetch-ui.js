// filler-fetch-ui.js — the progress overlay shown while filler data downloads.
const FillerFetchUI = {
  IDS: {
    overlay: "filler-fetch-ui-overlay",
    container: "filler-fetch-ui-container",
    progressFill: "filler-fetch-ui-progress-fill",
    progressText: "filler-fetch-ui-progress-text",
    logFeed: "filler-fetch-ui-log",
  },

  state: {
    isOpen: false,
    isRunning: false,
    isCancelled: false,
    fetchDone: false,
    autoMode: false,
    total: 0,
    fetched: 0,
    cached: 0,
    skipped: 0,
    failed: 0,
  },

  onComplete: null,

  init() {
    this.createModal();
    this.attachEventListeners();
  },

  createModal() {
    const { overlay, container, progressFill, progressText, logFeed } = this.IDS;

    const html = `
        <div id="${overlay}" class="ffui-overlay" style="display:none" aria-hidden="true">
          <div id="${container}" class="ffui-box" role="dialog" aria-modal="true" aria-labelledby="ffui-title" tabindex="-1">

            <div class="ffui-header">
              <span class="ffui-title" id="ffui-title"><span class="ffui-title-dot"></span>Fetch & Import</span>
              <button type="button" class="ffui-close" hidden>Done</button>
            </div>

            <div class="ffui-body">

              <!-- Progress bar -->
              <div class="ffui-progress-wrap">
                <div class="ffui-progress-info">
                  <span id="${progressText}" class="ffui-progress-label">Ready…</span>
                  <span class="ffui-pct">0%</span>
                </div>
                <div class="ffui-bar"><div id="${progressFill}" class="ffui-bar-fill"></div></div>
              </div>

              <!-- Stats -->
              <div class="ffui-stats">
                <div class="ffui-stat">
                  <span class="ffui-stat-val ffui-stat-cyan" data-stat="fetched">0</span>
                  <span class="ffui-stat-lbl">Fetched</span>
                </div>
                <div class="ffui-stat">
                  <span class="ffui-stat-val" data-stat="cached">0</span>
                  <span class="ffui-stat-lbl">Cached</span>
                </div>
                <div class="ffui-stat">
                  <span class="ffui-stat-val" data-stat="skipped">0</span>
                  <span class="ffui-stat-lbl">No Filler</span>
                </div>
                <div class="ffui-stat">
                  <span class="ffui-stat-val ffui-stat-err" data-stat="failed">0</span>
                  <span class="ffui-stat-lbl">Needs retry</span>
                </div>
              </div>

              <!-- Sites the browser keeps the extension off (filled by SiteAccess) -->
              <div class="ffui-access site-access" hidden></div>

              <!-- Live log -->
              <div id="${logFeed}" class="ffui-log" style="display:none"></div>

            </div>
          </div>
        </div>`;

    document.body.insertAdjacentHTML("beforeend", html);
  },

  // Called once the user has allowed access, so the caller can run Fetch & Import again.
  onAccessGranted: null,

  // Shows which needed sites the browser keeps the extension off, with Allow access. Every filler lookup fails
  // as "no site access" until they are allowed, which only the user can do.
  async checkSiteAccess() {
    const banner = document.querySelector(".ffui-access");
    const SiteAccess = window.AnimeTracker?.SiteAccess;
    if (!banner || !SiteAccess) return;
    await SiteAccess.render(banner, { onGranted: () => this.onAccessGranted?.() });
  },

  // A row that failed for lack of access is proof enough, even where the permissions API cannot say which
  // sites: say so, with the Settings path for the filler sites.
  _showAccessFallback() {
    const banner = document.querySelector(".ffui-access");
    if (!banner || !banner.hidden) return;
    const SiteAccess = window.AnimeTracker?.SiteAccess;
    const hosts = (SiteAccess?.GROUPS.find((group) => group.id === "filler")?.origins || []).map((origin) => SiteAccess.hostLabel(origin));
    const text = document.createElement("p");
    text.className = "site-access-text";
    text.textContent = "The browser is not letting the extension reach the filler sites, so filler data cannot be fetched.";
    const path = document.createElement("p");
    path.className = "site-access-path";
    path.textContent = `In ${SiteAccess?.SETTINGS_PATH || "the extension's settings"}, set each of these to Allow: ${hosts.join(", ")}.`;
    banner.replaceChildren(text, path);
    banner.hidden = false;
  },

  attachEventListeners() {
    const overlay = document.getElementById(this.IDS.overlay);
    overlay.querySelector(".ffui-close")?.addEventListener("click", () => this.close());
    const blockOutsideClick = (e) => {
      if (e.target.id !== this.IDS.overlay) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.state.fetchDone) {
        this.close();
      } else {
        this._nudgeModal();
      }
    };
    overlay.addEventListener("mousedown", blockOutsideClick);
    overlay.addEventListener("click", blockOutsideClick);

    if (this._escHandler) {
      try {
        document.removeEventListener("keydown", this._escHandler);
      } catch {}
    }
    this._escHandler = (e) => {
      if (e.key !== "Escape" || !this.state.isOpen) return;
      if (this.state.isRunning) {
        e.preventDefault();
        this._nudgeModal();
        return;
      }
      this.close();
    };
    document.addEventListener("keydown", this._escHandler);
  },

  async open(options = {}) {
    const autoMode = options.autoMode === true;
    this._clearAutoClose();
    this.state.isOpen = true;
    this.state.autoMode = autoMode;
    this.resetUI({ autoMode });

    const overlay = document.getElementById(this.IDS.overlay);
    const container = document.getElementById(this.IDS.container);
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => container?.focus?.());
    this.checkSiteAccess().catch(() => {});
  },

  close() {
    this._clearAutoClose();
    this.state.isOpen = false;
    this.state.autoMode = false;
    const overlay = document.getElementById(this.IDS.overlay);
    if (overlay && overlay.contains(document.activeElement)) {
      document.activeElement.blur?.();
    }
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  },

  _nudgeModal() {
    const container = document.getElementById(this.IDS.container);
    if (!container) return;
    container.classList.remove("is-attention");
    void container.offsetWidth;
    container.classList.add("is-attention");
  },

  resetUI(options = {}) {
    this._clearAutoClose();
    const keepAutoMode = options.autoMode === true;
    Object.assign(this.state, {
      isRunning: false,
      isCancelled: false,
      fetchDone: false,
      total: 0,
      fetched: 0,
      cached: 0,
      skipped: 0,
      failed: 0,
    });
    if (!keepAutoMode) this.state.autoMode = false;

    this._setProgress(0, "Ready to fetch and import your data…");
    const close = document.querySelector(".ffui-close");
    if (close) close.hidden = true;
    ["fetched", "cached", "skipped", "failed"].forEach((k) => this._setStat(k, 0));

    const log = document.getElementById(this.IDS.logFeed);
    log.innerHTML = "";
    log.style.display = "none";
  },

  _setProgress(pct, label) {
    document.getElementById(this.IDS.progressFill).style.width = `${pct}%`;
    document.querySelector(".ffui-pct").textContent = `${Math.round(pct)}%`;
    if (label !== undefined) document.getElementById(this.IDS.progressText).textContent = label;
  },

  _setStat(name, value) {
    const el = document.querySelector(`[data-stat="${name}"]`);
    if (!el) return;
    el.textContent = value;

    const shouldCollapse = (name === "cached" || name === "failed") && Number(value) === 0;
    el.closest(".ffui-stat")?.classList.toggle("is-hidden", shouldCollapse);
  },

  _renderLogs(entries) {
    const log = document.getElementById(this.IDS.logFeed);
    if (!entries || entries.length === 0) {
      log.innerHTML = "";
      log.style.display = "none";
      return;
    }
    const followLatest = log.children.length === 0 || log.scrollHeight - log.clientHeight - log.scrollTop < 24;
    const rows = new Map();
    for (const row of [...log.children]) {
      const key = row.dataset.ffuiLogKey;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(row);
    }
    log.style.display = "flex";
    entries.forEach((entry, index) => {
      const key = JSON.stringify([entry.at, entry.type, entry.slug, entry.name, entry.detail]);
      let row = rows.get(key)?.shift();
      if (!row) {
        row = this._log(entry.type || "cached", entry.name || entry.slug || "Import item", entry.detail || "");
        row.dataset.ffuiLogKey = key;
      }
      if (log.children[index] !== row) log.insertBefore(row, log.children[index] || null);
    });
    for (const remaining of rows.values()) remaining.forEach(row => row.remove());
    if (followLatest) log.scrollTop = log.scrollHeight;
  },

  showPendingStart(label = "Starting import…") {
    this._clearAutoClose();
    this.state.isRunning = true;
    this.state.fetchDone = false;
    this._setProgress(0, label);
  },

  getBackgroundProgress(state) {
    const rawFetchTotal = state?.fetchTotal;
    const explicitFetchTotal = Number(rawFetchTotal);
    const itemTotal = Array.isArray(state?.items) ? state.items.length : 0;
    const hasFetchTotal =
      rawFetchTotal !== null && rawFetchTotal !== undefined && Number.isFinite(explicitFetchTotal) && explicitFetchTotal >= 0;
    const total = hasFetchTotal
      ? Math.floor(explicitFetchTotal)
      : itemTotal > 0
        ? itemTotal
        : Math.max(0, Number(state?.total) || 0);
    const usesFetchQueue = hasFetchTotal || itemTotal > 0;
    const rawProcessed = usesFetchQueue ? Number(state?.queueIndex) || 0 : Number(state?.processed) || 0;
    const processed = Math.max(0, Math.min(total, rawProcessed));
    return { total, processed, remaining: Math.max(0, total - processed) };
  },

  applyBackgroundState(state) {
    if (!state) {
      this.resetUI();
      return;
    }

    if (state.status !== "completed") this._clearAutoClose();

    const progress = this.getBackgroundProgress(state);
    this.state.total = progress.total;
    this.state.fetched = Number(state.fetched) || 0;
    this.state.cached = Number(state.cached) || 0;
    this.state.skipped = Number(state.skipped) || 0;
    this.state.failed = Number(state.failed) || 0;
    this.state.isRunning = state.status === "running";
    this.state.fetchDone = state.status === "completed" || state.status === "error";
    const close = document.querySelector(".ffui-close");
    if (close) close.hidden = !this.state.fetchDone;

    this._setStat("fetched", this.state.fetched);
    this._setStat("cached", this.state.cached);
    this._setStat("skipped", this.state.skipped);
    this._setStat("failed", this.state.failed);
    this._renderLogs(Array.isArray(state.logs) ? state.logs : []);
    // A row that failed for lack of access is proof enough, even where the permissions API cannot say so.
    if ((state.logs || []).some((entry) => /no site access/i.test(String(entry?.detail || "")))) this._showAccessFallback();

    const { processed, total } = progress;
    const pct = state.status === "completed" ? 100 : total > 0 ? Math.min(100, (processed / total) * 100) : 0;

    const verifiedTotal = this.state.fetched + this.state.cached + this.state.skipped;
    const totalCount = progress.total > 0 ? progress.total : verifiedTotal;

    let label = "Ready to fetch and import your data…";
    if (state.status === "running") {
      const currentTitle = state.waitingForNetwork === true ? "Waiting for connection…" : state.currentTitle || state.currentSlug || "Working…";
      label = `${processed} / ${total} — ${currentTitle}`;
    } else if (state.status === "completed") {
      if (state.failed > 0) {
        label = `Import finished — ${state.failed} items need retry`;
      } else if (totalCount > 0) {
        label = `All ${totalCount} anime verified & up to date!`;
      } else {
        label = "Import complete — all anime up to date!";
      }
    } else if (state.status === "error") {
      label = state.errorMessage ? `Import error — ${state.errorMessage}` : "Import error — see log above";
    }

    this._setProgress(pct, label);

    if (state.status === "completed" && state.followUpPending !== true && !this.state.failed) {
      if (this.state.autoMode) {
        this._scheduleAutoClose();
      } else {
        this._clearAutoClose();
      }
    } else {
      this._clearAutoClose();
    }
  },

  _scheduleAutoClose() {
    this._clearAutoClose();
    this._autoCloseTimer = setTimeout(() => {
      this._autoCloseTimer = null;
      this.close();
    }, 900);
  },

  _clearAutoClose() {
    if (!this._autoCloseTimer) return;
    clearTimeout(this._autoCloseTimer);
    this._autoCloseTimer = null;
  },

  _log(type, name, detail = "") {
    const log = document.getElementById(this.IDS.logFeed);
    if (log.style.display === "none") log.style.display = "flex";

    const icons = { fetch: "*", cached: "o", skip: "-", nofill: "-", error: "x", retry: "!", movie: ">" };
    const classes = {
      fetch: "is-fetch",
      cached: "is-cached",
      skip: "is-nofill",
      nofill: "is-nofill",
      error: "is-error",
      retry: "is-retry",
      movie: "is-movie",
    };

    const row = document.createElement("div");
    row.className = `ffui-log-row ${classes[type] || ""}`;

    const iconSpan = document.createElement("span");
    iconSpan.className = "ffui-log-icon";
    iconSpan.textContent = icons[type] || "-";
    row.appendChild(iconSpan);

    const nameSpan = document.createElement("span");
    nameSpan.className = "ffui-log-name";
    nameSpan.setAttribute("title", name || "");
    nameSpan.textContent = name || "";
    row.appendChild(nameSpan);

    if (detail) {
      const detailSpan = document.createElement("span");
      detailSpan.className = "ffui-log-detail";
      detailSpan.setAttribute("title", detail);
      detailSpan.textContent = detail;
      row.appendChild(detailSpan);
    }

    log.appendChild(row);
    return row;
  },
};

window.AnimeTracker = window.AnimeTracker || {};
window.AnimeTracker.FillerFetchUI = FillerFetchUI;
