// metadata-repair.js — popup status UI for metadata repair and the "fetch all fillers" flow.
(function () {
  "use strict";

  const AT = window.AnimeTracker;

  // A running repair can pause while an MV3 worker sleeps. Keep its persisted
  // counters visible and use this threshold only to trigger a bounded resume nudge.
  const METADATA_REPAIR_STALE_MS = 3 * 60 * 1000;
  const METADATA_REPAIR_RESUME_NUDGE_COOLDOWN_MS = 30 * 1000;
  const METADATA_REPAIR_WAKE_INTERVAL_MS = 10 * 1000;
  const METADATA_REPAIR_MODAL_FETCH_THRESHOLD = 8;
  const METADATA_REPAIR_MODAL_FETCH_RATIO = 0.6;

  let elements, markInternalSave, scheduleDeferredListRefresh, sendRuntimeMessage, updateStats;
  let metadataRepairPromise = null;
  let lastMetadataRepairResumeNudgeAt = 0;
  let metadataRepairApplyVersion = 0;
  let metadataRepairWakeTimer = null;
  let metadataRepairWakeInFlight = false;
  let metadataRepairWakeEpoch = 0;
  let metadataRepairPopupClosed = false;
  let metadataRepairFailureRefreshTimer = null;

  function clearMetadataRepairFailureRefreshTimer() {
    if (metadataRepairFailureRefreshTimer !== null) clearTimeout(metadataRepairFailureRefreshTimer);
    metadataRepairFailureRefreshTimer = null;
  }

  async function refreshMetadataRepairFailures() {
    metadataRepairFailureRefreshTimer = null;
    const state = AT.PopupState.lastMetadataRepairState;
    if (metadataRepairPopupClosed || state?.status === "running" || !(state?.failed > 0) ||
        (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    const version = metadataRepairApplyVersion;
    try {
      const stored = await AT.Storage.get(["metadataRepairState"]);
      if (version !== metadataRepairApplyVersion || metadataRepairPopupClosed) return;
      await applyMetadataRepairState(stored.metadataRepairState || null);
    } catch {}
  }

  function scheduleMetadataRepairFailureRefresh() {
    const state = AT.PopupState.lastMetadataRepairState;
    if (state?.status === "running" || !(state?.failed > 0) || metadataRepairPopupClosed || typeof setTimeout !== "function") return;
    clearMetadataRepairFailureRefreshTimer();
    metadataRepairFailureRefreshTimer = setTimeout(refreshMetadataRepairFailures, 500);
  }

  function clearMetadataRepairWakeTimer() {
    if (metadataRepairWakeTimer !== null) clearTimeout(metadataRepairWakeTimer);
    metadataRepairWakeTimer = null;
  }

  function canWakeMetadataRepair() {
    const state = AT.PopupState.lastMetadataRepairState;
    return !metadataRepairPopupClosed && (state?.status === "running" || state?.followUpPending === true) &&
      (typeof document === "undefined" || document.visibilityState !== "hidden");
  }

  function scheduleMetadataRepairWake() {
    if (!canWakeMetadataRepair() || metadataRepairWakeInFlight || metadataRepairWakeTimer !== null || typeof setTimeout !== "function") return;
    metadataRepairWakeTimer = setTimeout(wakeMetadataRepair, METADATA_REPAIR_WAKE_INTERVAL_MS);
  }

  async function wakeMetadataRepair() {
    clearMetadataRepairWakeTimer();
    if (!canWakeMetadataRepair() || metadataRepairWakeInFlight) return;
    const epoch = metadataRepairWakeEpoch;
    metadataRepairWakeInFlight = true;
    try {
      await sendRuntimeMessage({ type: "RESUME_LIBRARY_REPAIR" }, 15000);
      if (epoch !== metadataRepairWakeEpoch || !canWakeMetadataRepair()) return;
      // Read storage again instead of rendering the pre-resume response. Its worker
      // may already have advanced the queue before the message arrives here.
      const stored = await AT.Storage.get(["metadataRepairState"]);
      if (epoch !== metadataRepairWakeEpoch || !canWakeMetadataRepair()) return;
      const latest = stored.metadataRepairState || null;
      const current = AT.PopupState.lastMetadataRepairState;
      if (!latest || latest.runId !== current?.runId || latest.updatedAt !== current?.updatedAt || latest.status !== current?.status) {
        await applyMetadataRepairState(latest);
      }
    } catch {
      // A suspended worker or closed response channel is retried on the next tick.
      // The persisted queue and successful cache entries remain authoritative.
    } finally {
      metadataRepairWakeInFlight = false;
      scheduleMetadataRepairWake();
    }
  }

  // Old reports are historical outcomes, not proof that current cache data is still
  // missing. Reconcile only failures with a newer successful snapshot; unresolved
  // retryable entries stay visible. This changes the view, never background state.
  async function reconcileMetadataRepairFailures(state) {
    if (!state || state.status === "running" || !(state.failed > 0)) return state;
    const failures = (state.failedItems || state.logs || []).filter(log => ["error", "retry"].includes(log.type) && log.slug && Number(log.at) > 0);
    if (!failures.length || !AT.CachePolicy) return state;
    const knownSlugs = new Set(failures.map(log => log.slug));
    const unknownFailures = !Array.isArray(state.failedItems) ? Math.max(0, Number(state.failed) - failures.length) : 0;
    const legacyCandidates = unknownFailures > 0
      ? [...new Set((state.items || []).map(item => item.slug).filter(slug => slug && !knownSlugs.has(slug)))] : [];
    const keys = [...knownSlugs, ...legacyCandidates].flatMap(slug => [`animeinfo_${slug}`, `episodeTypes_${slug}`]);
    let stored;
    try { stored = await AT.Storage.get(keys); } catch { return state; }
    let recovered = 0;
    const recoveredBySlug = new Map();
    const counts = { cached: Number(state.cached) || 0, skipped: Number(state.skipped) || 0 };
    for (const log of failures) {
      const info = stored[`animeinfo_${log.slug}`], filler = stored[`episodeTypes_${log.slug}`];
      const movie = AT.FillerService?.isLikelyMovie?.(log.slug, info?.mediaType) === true;
      if (!AT.CachePolicy.isInfoFresh(info) || info.retryable || info.error ||
          (!movie && (!AT.CachePolicy.isFillerFresh(filler, info) || filler.retryable || filler.error)) ||
          Math.max(Number(info.cachedAt) || 0, Number(filler?.cachedAt) || 0) < Number(log.at)) continue;
      recovered++;
      const skipped = movie || filler?.notFound;
      counts[skipped ? "skipped" : "cached"]++;
      recoveredBySlug.set(log.slug, { type: movie ? "movie" : filler?.notFound ? "nofill" : "cached", detail: "Recovered • cache refreshed" });
    }
    // Pre-7.5.5 reports did not retain identities beyond the sixty visible rows.
    // Only clear those unknown failures if every other queued item has newer,
    // healthy snapshots; otherwise keep the remaining count for a manual retry.
    const cutoff = Date.parse(state.completedAt || state.updatedAt || "") || Math.max(...failures.map(log => Number(log.at)));
    if (unknownFailures > 0 && recovered === failures.length && legacyCandidates.length >= unknownFailures && cutoff > 0 &&
        legacyCandidates.every(slug => {
          const info = stored[`animeinfo_${slug}`], filler = stored[`episodeTypes_${slug}`];
          const movie = AT.FillerService?.isLikelyMovie?.(slug, info?.mediaType) === true;
          return AT.CachePolicy.isInfoFresh(info) && !info.retryable && !info.error &&
            (movie || (AT.CachePolicy.isFillerFresh(filler, info) && !filler.retryable && !filler.error)) &&
            Math.max(Number(info.cachedAt) || 0, Number(filler?.cachedAt) || 0) >= cutoff;
        })) {
      recovered += unknownFailures;
      counts.cached += unknownFailures;
    }
    const logs = (state.logs || []).map(log => recoveredBySlug.has(log.slug) ? { ...log, ...recoveredBySlug.get(log.slug) } : log);
    return recovered ? { ...state, ...counts, logs,
      ...(state.failedItems ? { failedItems: state.failedItems.filter(log => !recoveredBySlug.has(log.slug)) } : {}),
      failed: Math.max(0, Number(state.failed) - recovered) } : state;
  }

  function getMetadataRepairProgress(state) {
    const progress = AT.FillerFetchUI?.getBackgroundProgress?.(state);
    if (progress) return progress;

    const total = Math.max(0, Number(state?.total) || 0);
    const processed = Math.max(0, Math.min(total, Number(state?.processed) || 0));
    return { total, processed, remaining: Math.max(0, total - processed) };
  }

  // Mirrors resolveMetadataRepairUiMode() in the worker; only used for states persisted
  // before the worker started stamping uiMode explicitly.
  function getMetadataRepairUiMode(state) {
    const origin = state?.origin || (state?.options?.auto === true ? "background" : "manual");
    if (origin === "manual") return "modal";
    if (state?.uiMode === "modal" || state?.uiMode === "status" || state?.uiMode === "silent") return state.uiMode;
    return "silent";
  }

  function setMetadataRepairStatus(label, synced = false, options = {}) {
    const source = options.source || "metadata";
    AT.SyncStatusController.setActivity(
      source,
      {
        label,
        tone: options.error === true ? "error" : synced ? "success" : "busy",
        title: options.title || "",
      },
    );
  }

  function restoreDefaultSyncStatus(options = {}) {
    return AT.SyncStatusController.refreshCloudStatus({
      immediate: options.immediate === true,
      debounceMs: options.debounceMs,
    });
  }

  function scheduleDefaultSyncStatusRestore(delayMs = 2500, source = "metadata") {
    AT.SyncStatusController.clearActivity(source, { delayMs });
    void restoreDefaultSyncStatus();
  }

  function applyAnimeInfoCacheChange(storageKey, value) {
    const slug = storageKey.replace("animeinfo_", "");
    if (!slug) return;

    if (value) {
      AT.AnilistService.cache[slug] = value;
    } else {
      delete AT.AnilistService.cache[slug];
    }

    scheduleCompletionRepair(slug);
    scheduleMetadataRepairFailureRefresh();
  }

  const _pendingRepairSlugs = new Set();
  let _repairFlushTimer = null;

  function scheduleCompletionRepair(slug) {
    if (!AT.PopupState.animeData?.[slug]) return;
    _pendingRepairSlugs.add(slug);
    if (_repairFlushTimer) clearTimeout(_repairFlushTimer);
    _repairFlushTimer = setTimeout(flushPendingCompletionRepair, 1500);
  }

  function flushPendingCompletionRepair() {
    _repairFlushTimer = null;
    const slugs = [..._pendingRepairSlugs];
    _pendingRepairSlugs.clear();
    if (slugs.length === 0) return;

    void AT.LibraryMutations.enqueue("completion-repair", async ({ commit, snapshot }) => {
      const data = snapshot.animeData || {};
      const present = slugs.filter((slug) => data[slug]);
      if (present.length === 0) return null;

      let changed = false;
      for (const slug of present) {
        if (AT.AnilistService.backfillAnimeEntry(data[slug], AT.AnilistService.cache[slug])) changed = true;
      }
      if (AT.StatusService.repairAiringCompleted(data, { slugs: present })) changed = true;
      if (AT.StatusService.persistDetectedCompletions(data, { slugs: present })) changed = true;
      if (!changed) return null;

      await commit({ animeData: data }, { markInternalSave, immediate: false });
      return data;
    })
      .then((data) => {
        if (data) AT.PopupState.animeData = data;
      })
      .catch((error) => {
        PopupLogger.warn("AnimeInfo", "Failed to persist repaired completion state:", error);
      });
  }

  function applyEpisodeTypesCacheChange(storageKey, value) {
    const slug = storageKey.replace("episodeTypes_", "");
    if (!slug) return;

    const { FillerService } = AT;
    if (AT.CachePolicy.isFillerUsableSnapshot(value)) {
      FillerService.episodeTypesCache[slug] = value;
      FillerService.updateFromEpisodeTypes(slug, value);
    } else {
      delete FillerService.episodeTypesCache[slug];
      delete FillerService.KNOWN_FILLERS[slug];
    }
    scheduleCompletionRepair(slug);
    scheduleMetadataRepairFailureRefresh();
  }

  async function applyMetadataRepairState(state, options = {}) {
    const applyVersion = ++metadataRepairApplyVersion;
    const { ensureOpen = false, autoOpenRunning = false } = options;

    state = await reconcileMetadataRepairFailures(state);
    if (applyVersion !== metadataRepairApplyVersion) return state;

    const previousState = AT.PopupState.lastMetadataRepairState || null;
    const previousStatus = previousState?.status || null;
    if (state?.status === "throttled") return previousState;
    AT.PopupState.lastMetadataRepairState = state || null;
    if (state?.status === "running" || state?.followUpPending === true) scheduleMetadataRepairWake();
    else {
      metadataRepairWakeEpoch++;
      clearMetadataRepairWakeTimer();
    }
    if (state?.status === "running" || !(state?.failed > 0)) clearMetadataRepairFailureRefreshTimer();
    const { FillerFetchUI } = AT;

    if (!state) {
      lastMetadataRepairResumeNudgeAt = 0;
      if (FillerFetchUI.state.isOpen) FillerFetchUI.applyBackgroundState(null);
      AT.SyncStatusController.clearActivity("metadata");
      void restoreDefaultSyncStatus({ immediate: true });
      return null;
    }

    const uiMode = getMetadataRepairUiMode(state);
    const isSilent = uiMode === "silent" && !ensureOpen;
    const shouldOpen = ensureOpen || (autoOpenRunning && state.status === "running" && uiMode === "modal");
    if (!ensureOpen && FillerFetchUI.state.autoMode && (uiMode === "status" || uiMode === "silent") && FillerFetchUI.state.isOpen) {
      FillerFetchUI.close();
    }
    if (shouldOpen && !FillerFetchUI.state.isOpen) {
      await FillerFetchUI.open();
      if (applyVersion !== metadataRepairApplyVersion) return state;
    }
    if (FillerFetchUI.state.isOpen || shouldOpen) {
      FillerFetchUI.applyBackgroundState(state);
    }

    if (state.status === "running") {
      const updatedAt = state.updatedAt ? Date.parse(state.updatedAt) : 0;
      const progress = getMetadataRepairProgress(state);
      if (!updatedAt || Date.now() - updatedAt > METADATA_REPAIR_STALE_MS) {
        if (!isSilent) {
          setMetadataRepairStatus(
            progress.total > 0 ? `Resuming ${progress.processed}/${progress.total}...` : "Resuming import...",
          );
        }

        // The persisted counters remain authoritative while an MV3 worker is waking up.
        // Keep them visible and only nudge the background at a bounded rate.
        const now = Date.now();
        if (now - lastMetadataRepairResumeNudgeAt >= METADATA_REPAIR_RESUME_NUDGE_COOLDOWN_MS) {
          lastMetadataRepairResumeNudgeAt = now;
          sendRuntimeMessage?.(
            {
              type: "START_LIBRARY_REPAIR",
              forceInfoRefresh: false,
              forceFillerRefresh: false,
              auto: state.options?.auto === true,
              origin: state.origin || (state.options?.auto === true ? "background" : "manual"),
            },
            30000,
          )?.catch?.(() => {});
        }
        return state;
      }
      lastMetadataRepairResumeNudgeAt = 0;
      const nextStep = progress.total > 0 ? Math.min(progress.total, progress.processed + 1) : 0;
      if (isSilent) {
        // Deliberately mute: cards still refresh live via applyAnimeInfoCacheChange.
        return state;
      }
      if (uiMode === "status") {
        setMetadataRepairStatus(
          progress.remaining > 0 ? `Fetching ${progress.remaining} anime...` : "Fetching data...",
        );
      } else {
        setMetadataRepairStatus(progress.total > 0 ? `Fetching ${nextStep}/${progress.total}...` : "Fetching data...");
      }
      return state;
    }

    if (state.status === "completed") {
      if (state.followUpPending === true) {
        if (!isSilent) setMetadataRepairStatus("Fetching data...");
        return state;
      }
      const isNewRun = previousStatus !== "completed" || previousState?.runId !== state.runId;
      if (!isSilent) {
        const label = state.failed > 0 ? `Import Complete (${state.failed} need retry)` : "Import Complete";
        setMetadataRepairStatus(label, true);
      }
      if (isNewRun) {
        scheduleDeferredListRefresh({ delayMs: 0 });
        await updateStats();
      }
      if (applyVersion !== metadataRepairApplyVersion) return state;
      if (!isSilent) scheduleDefaultSyncStatusRestore();
      return state;
    }

    if (state.status === "error") {
      // A background refresh that failed is not the user's problem to look at - the alarms retry
      // it. Only a run the user started reports its own failure.
      if (!isSilent) {
        setMetadataRepairStatus("Import Error", false, {
          error: true,
          title: state.errorMessage || "Metadata import failed",
        });
      }
      return state;
    }

    return state;
  }

  async function syncMetadataRepairStateFromStorage(options = {}) {
    const { Storage } = AT;
    const result = await Storage.get(["metadataRepairState"]);
    const initialState = result.metadataRepairState || null;
    const appliedState = await applyMetadataRepairState(initialState, options);

    // Opening the overlay awaits storage/DOM work. Re-read once so a progress or
    // completion write that landed during that window is not missed before the
    // popup's storage listener has been attached.
    if (initialState?.status === "running") {
      const latest = await Storage.get(["metadataRepairState"]);
      const latestState = latest.metadataRepairState || null;
      if (latestState?.updatedAt !== initialState.updatedAt || latestState?.status !== initialState.status) {
        return applyMetadataRepairState(latestState, options);
      }
    }

    return appliedState;
  }

  async function maybePromptPostUpdateFetch() {
    const { Storage } = AT;
    try {
      const stored = await Storage.get(["postUpdateFetchTriggeredAt", "postUpdateFetchToVersion", "metadataRepairState"]);

      if (stored.postUpdateFetchTriggeredAt) {
        await Storage.remove(["postUpdateFetchTriggeredAt", "postUpdateFetchFromVersion", "postUpdateFetchToVersion"]);
      }

      if (stored.metadataRepairState?.status === "running") {
        await applyMetadataRepairState(stored.metadataRepairState, { autoOpenRunning: false });
      }
    } catch (e) {
      PopupLogger.warn("Init", "Post-update silent sync failed:", e);
    }
  }

  async function fetchAllFillers(options = {}) {
    const { autoStart = true, forceInfoRefresh = false, forceFillerRefresh = false, autoMode = false } = options;

    const { FillerFetchUI } = AT;

    if (metadataRepairPromise) {
      if (!FillerFetchUI.state.isOpen) await FillerFetchUI.open({ autoMode });
      await syncMetadataRepairStateFromStorage({ ensureOpen: true });
      return metadataRepairPromise;
    }

    if (!FillerFetchUI.state.isOpen) await FillerFetchUI.open({ autoMode });

    if (!autoStart) {
      return syncMetadataRepairStateFromStorage({ ensureOpen: true });
    }

    let startingState = null;
    metadataRepairPromise = (async () => {
      const persistedState = await syncMetadataRepairStateFromStorage({ ensureOpen: true });
      startingState = persistedState;
      if (persistedState?.status === "running") {
        const response = await sendRuntimeMessage(
          {
            type: "START_LIBRARY_REPAIR",
            forceInfoRefresh: false,
            forceFillerRefresh: false,
            auto: false,
            origin: "manual",
          },
          30000,
        );
        if (!response?.success) {
          throw new Error(response?.error || "Failed to resume import");
        }
        return applyMetadataRepairState(response.state || persistedState, { ensureOpen: true });
      }

      setMetadataRepairStatus("Importing data...");
      FillerFetchUI.showPendingStart("Starting import…");

      const response = await sendRuntimeMessage(
        {
          type: "START_LIBRARY_REPAIR",
          forceInfoRefresh,
          forceFillerRefresh,
          isMobile: AnimeTrackerUtils.isMobileDevice(),
          origin: "manual",
        },
        30000,
      );

      if (!response?.success) {
        throw new Error(response?.error || "Failed to start import");
      }

      return applyMetadataRepairState(response.state || null, { ensureOpen: true });
    })()
      .catch(async (error) => {
        // A lost response does not mean the worker failed to start. Reconcile its job
        // before changing the local modal; never persist a transport error over that job.
        try {
          const stored = await AT.Storage.get(["metadataRepairState"]);
          const state = stored.metadataRepairState;
          const newRun = state?.runId && state.runId !== startingState?.runId;
          const resumedRun = startingState?.status === "running" && state?.runId === startingState.runId;
          if (state?.status === "running" || ((newRun || resumedRun) && ["completed", "error"].includes(state?.status))) {
            return applyMetadataRepairState(state, { ensureOpen: true });
          }
        } catch {}
        PopupLogger.error("RepairAll", "Error:", error);
        await applyMetadataRepairState({
          status: "error",
          origin: "manual",
          uiMode: "modal",
          errorMessage: error?.message || "Unable to start import. Please retry.",
          total: 0,
          processed: 0,
          logs: [],
        }, { ensureOpen: true });
        throw error;
      })
      .finally(() => {
        metadataRepairPromise = null;
      });

    return metadataRepairPromise;
  }

  AT.MetadataRepair = {
    _init(d) {
      elements = d.elements;
      markInternalSave = d.markInternalSave;
      scheduleDeferredListRefresh = d.scheduleDeferredListRefresh;
      sendRuntimeMessage = d.sendRuntimeMessage;
      updateStats = d.updateStats;
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
        metadataRepairWakeEpoch++;
        clearMetadataRepairWakeTimer();
        clearMetadataRepairFailureRefreshTimer();
        if (canWakeMetadataRepair()) void wakeMetadataRepair();
        else void refreshMetadataRepairFailures();
      });
      window.addEventListener?.("pagehide", () => {
        metadataRepairPopupClosed = true;
        metadataRepairWakeEpoch++;
        clearMetadataRepairWakeTimer();
        clearMetadataRepairFailureRefreshTimer();
      });
      window.addEventListener?.("pageshow", () => {
        metadataRepairPopupClosed = false;
        if (canWakeMetadataRepair()) void wakeMetadataRepair();
        else void refreshMetadataRepairFailures();
      });
      AT.SyncStatusController.init({
        statusElement: elements.syncStatus,
        textElement: elements.syncText,
        getUser: () => AT.FirebaseSync?.getUser?.() || null,
      });
    },
    setMetadataRepairStatus,
    restoreDefaultSyncStatus,
    scheduleDefaultSyncStatusRestore,
    applyAnimeInfoCacheChange,
    applyEpisodeTypesCacheChange,
    applyMetadataRepairState,
    syncMetadataRepairStateFromStorage,
    maybePromptPostUpdateFetch,
    fetchAllFillers,
  };
})();
