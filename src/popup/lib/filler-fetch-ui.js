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

  // Called when the user presses Stop; the caller ends the background run.
  onStop: null,

  HIDDEN_RUN_KEY: "ffuiHiddenRunId",

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
              <div class="ffui-actions">
                <button type="button" class="ffui-stop" hidden>Stop</button>
                <button type="button" class="ffui-close" hidden>Done</button>
              </div>
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
    await SiteAccess.render(banner, { onGranted: () => this.onAccessGranted?.(),
      knownBlockedOrigins: this._waitingForAccess ? this._blockedOrigins : null });
  },

  // A row that failed for lack of access is proof enough, even where the permissions API cannot say which
  // sites: say so, with the Settings path for the filler sites.
  _showAccessFallback(blockedOrigins) {
    const banner = document.querySelector(".ffui-access");
    const SiteAccess = window.AnimeTracker?.SiteAccess;
    if (!banner || !SiteAccess) return;
    const origins = blockedOrigins?.length ? blockedOrigins : SiteAccess.GROUPS.find(group => group.id === "filler")?.origins || [];
    void SiteAccess.render(banner, { knownBlockedOrigins: origins, onGranted: () => this.onAccessGranted?.() }).catch(() => {});
  },

  attachEventListeners() {
    const overlay = document.getElementById(this.IDS.overlay);
    overlay.querySelector(".ffui-close")?.addEventListener("click", () => this.close());
    overlay.querySelector(".ffui-stop")?.addEventListener("click", () => this.stop());
    // A run carries on in the background, so the panel never holds the popup hostage: tapping outside hides it.
    const outsideClick = (e) => {
      if (e.target.id !== this.IDS.overlay) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "click") this.close();
    };
    overlay.addEventListener("mousedown", outsideClick);
    overlay.addEventListener("click", outsideClick);

    if (this._escHandler) {
      try {
        document.removeEventListener("keydown", this._escHandler);
      } catch {}
    }
    this._escHandler = (e) => {
      if (e.key !== "Escape" || !this.state.isOpen) return;
      e.preventDefault();
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

  // Hiding a run that is still going remembers it, so reopening the popup does not throw the panel back up for
  // the same run. The status line keeps showing its progress, and Fetch & Import brings the panel back.
  close() {
    this._clearAutoClose();
    if (this._runId && !this.state.fetchDone) this._rememberHidden(this._runId);
    this.state.isOpen = false;
    this.state.autoMode = false;
    const overlay = document.getElementById(this.IDS.overlay);
    if (overlay && overlay.contains(document.activeElement)) {
      document.activeElement.blur?.();
    }
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  },

  // Kept in this popup's storage so it survives closing it; in memory where storage is unavailable.
  isHiddenRun(runId) {
    if (!runId) return false;
    let stored = null;
    try { stored = localStorage.getItem(this.HIDDEN_RUN_KEY); } catch {}
    return (stored ?? this._hiddenRunId) === String(runId);
  },

  _rememberHidden(runId) {
    this._hiddenRunId = String(runId);
    try { localStorage.setItem(this.HIDDEN_RUN_KEY, this._hiddenRunId); } catch {}
  },

  // Stop ends the run in the background; the panel shows the result the caller hands back.
  async stop() {
    const button = document.querySelector(".ffui-stop");
    if (!button || button.disabled || typeof this.onStop !== "function") return;
    button.disabled = true;
    button.textContent = "Stopping…";
    try {
      await this.onStop();
    } finally {
      button.disabled = false;
      button.textContent = "Stop";
    }
  },

  // Hide while a run is going (it carries on), Done once it has ended; Stop only while there is a run to stop.
  _setActions({ running = false, done = false, canStop = false } = {}) {
    const close = document.querySelector(".ffui-close");
    const stop = document.querySelector(".ffui-stop");
    if (close) {
      close.hidden = !running && !done;
      close.textContent = done ? "Done" : "Hide";
    }
    if (stop) stop.hidden = !(running && canStop && typeof this.onStop === "function");
  },

  resetUI(options = {}) {
    this._clearAutoClose();
    this._setJikanCountdown(0);
    this._waitingForAccess = false;
    this._blockedOrigins = null;
    this._accessSignature = null;
    this._runId = null;
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
    this._setActions();
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
    this._setActions({ running: true });
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
    const wasWaitingForAccess = this._waitingForAccess;
    this._waitingForAccess = state.status === "running" && state.waitingForAccess === true;
    this._blockedOrigins = this._waitingForAccess ? state.blockedOrigins?.length ? state.blockedOrigins :
      window.AnimeTracker?.SiteAccess?.GROUPS.find(group => group.id === "filler")?.origins : null;
    this.state.isRunning = state.status === "running" && !this._waitingForAccess;
    this.state.fetchDone = state.status === "completed" || state.status === "error";
    this._runId = state.runId || null;
    this._setActions({ running: state.status === "running", done: this.state.fetchDone, canStop: !!state.runId });

    this._setStat("fetched", this.state.fetched);
    this._setStat("cached", this.state.cached);
    this._setStat("skipped", this.state.skipped);
    this._setStat("failed", this.state.failed);
    this._renderLogs(Array.isArray(state.logs) ? state.logs : []);
    // A row that failed for lack of access is proof enough, even where the permissions API cannot say so.
    const needsAccess = this._waitingForAccess || (state.waitingForAccess !== false &&
      (state.logs || []).some(entry => /no site access/i.test(String(entry?.detail || ""))));
    if (needsAccess) {
      const signature = JSON.stringify([state.runId, state.blockedOrigins || null]);
      if (this._accessSignature !== signature) {
        this._accessSignature = signature;
        this._showAccessFallback(state.blockedOrigins);
      }
    } else if (wasWaitingForAccess || this._accessSignature !== null) {
      this._accessSignature = null;
      void this.checkSiteAccess().catch(() => {});
    }

    const { processed, total } = progress;
    const pct = state.status === "completed" ? 100 : total > 0 ? Math.min(100, (processed / total) * 100) : 0;

    const verifiedTotal = this.state.fetched + this.state.cached + this.state.skipped;
    const totalCount = progress.total > 0 ? progress.total : verifiedTotal;

    let label = "Ready to fetch and import your data…";
    const jikanUntil = state.status === "running" && !this._waitingForAccess && state.waitingForNetwork !== true &&
      Number(state.waitingForJikanUntil) > Date.now() ? Number(state.waitingForJikanUntil) : 0;
    if (state.status === "running") {
      const currentTitle = this._waitingForAccess ? "Waiting for website access…" :
        state.waitingForNetwork === true ? "Waiting for connection…" :
        jikanUntil ? this.jikanWaitLabel(jikanUntil) :
        state.currentTitle || state.currentSlug || "Working…";
      label = `${processed} / ${total} — ${currentTitle}`;
    } else if (state.status === "completed") {
      if (state.stopped === true) {
        label = `Stopped — ${processed} of ${total} checked`;
      } else if (state.failed > 0) {
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
    this._setJikanCountdown(jikanUntil, () => this._setProgress(pct, `${processed} / ${total} — ${this.jikanWaitLabel(jikanUntil)}`));

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

  // The shows left all wait for the filler source (Jikan) to answer again. A ticking countdown shows the run is
  // waiting, not stuck: a still "continuing shortly" read as frozen at 0 of 76.
  jikanWaitLabel(until) {
    const seconds = Math.ceil((Number(until) - Date.now()) / 1000);
    if (!(seconds > 0)) return "Filler source busy, retrying now…";
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    return `Filler source busy, retrying in ${time}`;
  },

  _setJikanCountdown(until, render) {
    if (this._jikanTimer) clearInterval(this._jikanTimer);
    this._jikanTimer = null;
    if (!(until > Date.now()) || typeof render !== "function") return;
    this._jikanTimer = setInterval(() => {
      render();
      if (Date.now() >= until) {
        clearInterval(this._jikanTimer);
        this._jikanTimer = null;
      }
    }, 1000);
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
