// progress-tracker.js — tracks watch progress and decides when to save and when an
// episode counts as completed.
const ProgressTracker = {
  lastSavedProgress: new Map(),
  lastSaveTime: 0,
  saveInProgress: false,
  saveQueue: [],
  isProcessingQueue: false,
  pendingSeekSave: null,
  seekSaveTimeout: null,
  seekSaveDueAt: 0,
  _generation: 0,
  _sampleSequence: 0,
  _sampleSession: null,
  _sampleTime: 0,
  MAX_REASONABLE_DURATION_SECONDS: 6 * 60 * 60,

  _vpCache: null,
  _vpCacheTime: 0,
  _VP_CACHE_TTL: 5000,

  _adCache: null,
  _adCacheTime: 0,
  _AD_CACHE_TTL: 15000,

  _isQuotaError(err) {
    if (!err) return false;
    const msg = String(err.message || err || "").toLowerCase();
    if (!msg) return false;
    return (
      msg.includes("quota") ||
      msg.includes("exceeds the quota") ||
      msg.includes("storage capacity") ||
      msg.includes("max_items") ||
      msg.includes("max_write_operations")
    );
  },

  _emergencyPruneProgress(videoProgress, keepId) {
    const entries = Object.entries(videoProgress);
    entries.sort((a, b) => {
      const ta = a[1]?.savedAt ? new Date(a[1].savedAt).getTime() : 0;
      const tb = b[1]?.savedAt ? new Date(b[1].savedAt).getTime() : 0;
      return tb - ta;
    });
    const MAX = 50;
    const pruned = {};
    if (keepId && videoProgress[keepId]) pruned[keepId] = videoProgress[keepId];
    for (const [id, p] of entries) {
      if (Object.keys(pruned).length >= MAX) break;
      pruned[id] = p;
    }
    return pruned;
  },

  _isEpisodeAlreadyTrackedSync(uniqueId, animeData) {
    if (!uniqueId || !animeData) return false;
    const m = uniqueId.match(/^(.+)__episode-(\d+)$/);
    if (!m) return false;
    const slug = m[1];
    const num = parseInt(m[2], 10);
    const anime = animeData[slug];
    if (!anime || !Array.isArray(anime.episodes)) return false;

    const listState = String(anime.listState || "").toLowerCase();
    if (anime.onHoldAt || anime.droppedAt || listState === "on_hold" || listState === "dropped") return false;
    return anime.episodes.some((ep) => {
      if (Number(ep?.number) !== num) return false;

      if (ep?.durationSource === "anilist") return false;
      return true;
    });
  },

  _compactNow() {
    return new Date().toISOString().split(".")[0] + "Z";
  },

  normalizeDuration(duration) {
    let value = Math.round(Number(duration) || 0);
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value > this.MAX_REASONABLE_DURATION_SECONDS) {
      value = this.MAX_REASONABLE_DURATION_SECONDS;
    }
    return value;
  },

  isPlaceholderDuration(duration) {
    const shared = globalThis.AnimeTrackerMergeUtils;
    if (shared?.isPlaceholderDuration) return shared.isPlaceholderDuration(duration);
    const d = Number(duration) || 0;
    return d <= 0 || d === 1440 || d === 6000 || d === 7200;
  },

  shouldMarkComplete(currentTime, duration, outroStartSec = null) {
    const { CONFIG } = window.AnimeTrackerContent;

    if (!duration || duration <= 0) return false;

    const progress = currentTime / duration;
    const remainingTime = duration - currentTime;

    if (outroStartSec && outroStartSec > 0 && outroStartSec < duration) {
      const MIN_STORY_PROGRESS = 0.5;
      if (currentTime >= outroStartSec && progress >= MIN_STORY_PROGRESS) return true;

      if (progress >= 0.95) return true;
      return false;
    }

    const progressThreshold = (CONFIG.COMPLETED_PERCENTAGE || 85) / 100;
    const outroThreshold = CONFIG.REMAINING_TIME_THRESHOLD || 120;

    if (progress >= progressThreshold) return true;

    const MIN_OUTRO_PROGRESS = 0.6;
    if (remainingTime <= outroThreshold && progress >= MIN_OUTRO_PROGRESS) return true;

    return false;
  },

  cleanLastSavedProgress() {
    const { CONFIG } = window.AnimeTrackerContent;
    if (this.lastSavedProgress.size > CONFIG.MAX_SAVED_PROGRESS_ENTRIES) {
      Array.from(this.lastSavedProgress.keys())
        .slice(0, this.lastSavedProgress.size - CONFIG.MAX_SAVED_PROGRESS_ENTRIES)
        .forEach((key) => this.lastSavedProgress.delete(key));
    }
  },

  // "Start over" is a deliberate rewind. The save path otherwise never lets the stored position go DOWN,
  // so after starting over the resume point stayed at the old later time until playback passed it.
  allowRewind(uniqueId) {
    this._rewindAllowedFor = uniqueId || null;
  },

  cleanVideoProgress(videoProgress, currentUniqueId) {
    const { CONFIG, Logger } = window.AnimeTrackerContent;

    if (!videoProgress || typeof videoProgress !== "object") return {};
    if (!currentUniqueId || typeof currentUniqueId !== "string") {
      Logger.warn("cleanVideoProgress called with invalid currentUniqueId:", currentUniqueId);
      return videoProgress;
    }

    const now = Date.now();
    const entries = Object.entries(videoProgress);
    const tracker = window.AnimeTrackerContent.ProgressTracker || this;

    const filtered = entries.filter(([id, progress]) => {
      if (id === currentUniqueId) return true;

      if (progress.deleted) {
        const tombstoneAge = now - (progress.deletedAt ? new Date(progress.deletedAt).getTime() : 0);

        const TOMBSTONE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
        if (tombstoneAge > TOMBSTONE_MAX_AGE) {
          Logger.debug("Removing expired tombstone:", id);
          return false;
        }
        return true;
      }

      // "Complete" means what shouldMarkComplete says it means. This used to drop anything with 120s or
      // less remaining regardless of progress, so 70s left of a 180s video (38% watched, not complete by
      // shouldMarkComplete) lost its resume point. It also dropped every entry older than 7 days on
      // every save; the background and popup never age out active progress, so that is gone too.
      if (
        progress.percentage >= CONFIG.COMPLETED_PERCENTAGE ||
        tracker.shouldMarkComplete(Number(progress.currentTime) || 0, Number(progress.duration) || 0)
      ) {
        Logger.debug("Removing completed progress:", id);
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      const timeA = a[1].savedAt ? new Date(a[1].savedAt).getTime() : 0;
      const timeB = b[1].savedAt ? new Date(b[1].savedAt).getTime() : 0;
      return timeB - timeA;
    });

    const limited = filtered.slice(0, CONFIG.MAX_PROGRESS_ENTRIES);

    const cleaned = {};
    limited.forEach(([id, progress]) => {
      cleaned[id] = progress;
    });

    const removedCount = entries.length - limited.length;
    if (removedCount > 0) {
      Logger.info(`Cleaned ${removedCount} old progress entries`);
    }

    return cleaned;
  },

  async processSaveQueue() {
    const { Logger } = window.AnimeTrackerContent;

    if (this.isProcessingQueue || this.saveQueue.length === 0) return;

    this.isProcessingQueue = true;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    while (this.saveQueue.length > 0 && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      const saveTask = this.saveQueue.shift();
      saveTask.retryCount = saveTask.retryCount || 0;

      try {
        await this.performSaveProgress(saveTask.uniqueId, saveTask.currentTime, saveTask.duration, saveTask.context);
        consecutiveFailures = 0;
      } catch (e) {
        Logger.error("Failed to save progress from queue:", e);
        consecutiveFailures++;

        if (saveTask.retryCount < 2) {
          saveTask.retryCount++;
          this.saveQueue.push(saveTask);
          await AnimeTrackerUtils.sleep(1000 * saveTask.retryCount);
        } else {
          Logger.warn("Dropping save task after max retries:", saveTask.uniqueId);
        }
      }
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && this.saveQueue.length > 0) {
      Logger.error("Too many consecutive failures, clearing save queue");
      this.saveQueue = [];
    }

    this.isProcessingQueue = false;
  },

  captureProgressContext(uniqueId) {
    const AT = window.AnimeTrackerContent;
    const info = AT.getWatchProgressContext?.();
    const matchingInfo = info?.uniqueId === uniqueId ? info : null;
    const id = uniqueId?.match(/^(.+)__episode-(\d+)$/);
    const expectedPage = id ? `${id[1]}-episode-${id[2]}` : "";
    let path = "";
    try {
      const pathname = matchingInfo?.url ? new URL(matchingInfo.url).pathname : window.location?.pathname || "";
      path = pathname.match(/\/watch\/([^/?#]+)/)?.[1] || "";
    } catch {}
    const samePage = !!matchingInfo || path === expectedPage;
    const canReadPage = samePage && (!matchingInfo?.url || matchingInfo.url === window.location?.href);
    this._sampleSession ||= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    // Distinct accepted samples retain their order even within one clock millisecond.
    this._sampleTime = Math.max(Date.now(), this._sampleTime + 1);
    const sampledAt = new Date(this._sampleTime).toISOString();
    return {
      generation: this._generation,
      sampleSession: this._sampleSession,
      sampleSequence: ++this._sampleSequence,
      sampledAt,
      coverImage: matchingInfo?.coverImage || (canReadPage ? AT.AnimeParser?.extractCoverImage?.() : null),
      siteAnimeId: matchingInfo?.siteAnimeId || (canReadPage ? AT.AnimeParser?.extractSiteAnimeId?.() : null),
      // null means a known canonical URL; undefined means page identity is unavailable.
      pagePath: samePage && path ? (path !== expectedPage ? path : null) : undefined,
      allowRewind: this._rewindAllowedFor === uniqueId,
      rewoundAt: this._rewindAllowedFor === uniqueId ? sampledAt : null,
    };
  },

  async syncProgressWatchlist(uniqueId, currentTime, context) {
    if (context.generation !== this._generation || this._watchlistSynced || currentTime < 120) return;
    const { Storage, Logger, WatchlistSync } = window.AnimeTrackerContent;
    if (!WatchlistSync) return;
    try {
      const slug = uniqueId.match(/^(.+)__episode-\d+$/)?.[1];
      if (!slug) return;
      const result = await Storage.get(["animeData"]);
      if (context.generation !== this._generation || Storage.isAbortResult(result)) return;
      const entry = result.animeData?.[slug] || null;
      const siteId = entry?.siteAnimeId || context.siteAnimeId;
      if (siteId) {
        WatchlistSync.syncFromStorage(siteId, slug, { fallbackType: WatchlistSync.getProgressFallbackType(entry, slug) });
        this._watchlistSynced = true;
      }
    } catch (error) {
      Logger.warn("Watchlist sync failed, will retry on next save:", error);
    }
  },

  async performSaveProgress(uniqueId, currentTime, duration, context = this.captureProgressContext(uniqueId)) {
    const { CONFIG, Storage, Logger } = window.AnimeTrackerContent;

    if (!Storage.isContextValid()) {
      return;
    }

    if (this.saveInProgress) {
      if (this.saveQueue.length >= CONFIG.MAX_SAVE_QUEUE_SIZE) {
        this.saveQueue.shift();
      }
      this.saveQueue.push({ uniqueId, currentTime, duration, context, retryCount: 0 });
      return;
    }

    this.saveInProgress = true;

    try {
      if (!uniqueId || typeof uniqueId !== "string") {
        throw new Error("Invalid uniqueId for progress save");
      }

      if (
        isNaN(currentTime) ||
        isNaN(duration) ||
        duration <= 0 ||
        !isFinite(currentTime) ||
        !isFinite(duration) ||
        currentTime < 0 ||
        duration > 100000
      ) {
        throw new Error(`Invalid time values: currentTime=${currentTime}, duration=${duration}`);
      }

      const now = Date.now();
      let videoProgress;
      let animeData;

      const vpCacheHit = this._vpCache && now - this._vpCacheTime < this._VP_CACHE_TTL;
      const adCacheHit = this._adCache && now - this._adCacheTime < this._AD_CACHE_TTL;

      if (vpCacheHit && adCacheHit) {
        videoProgress = this._vpCache;
        animeData = this._adCache;
      } else {
        const keys = [];
        if (!vpCacheHit) keys.push("videoProgress");
        if (!adCacheHit) keys.push("animeData");
        const result = await Storage.get(keys);
        if (Storage.isAbortResult(result)) {
          Logger.warn("Skip progress save: storage read unavailable (would clobber data)");
          return;
        }
        videoProgress = vpCacheHit ? this._vpCache : result.videoProgress || {};
        animeData = adCacheHit ? this._adCache : result.animeData || {};
        if (!adCacheHit && context.generation === this._generation) {
          this._adCache = animeData;
          this._adCacheTime = now;
        }
      }

      if (this._isEpisodeAlreadyTrackedSync(uniqueId, animeData)) {
        Logger.debug("Skip progress save: episode already tracked", uniqueId);
        return;
      }

      if (typeof videoProgress !== "object" || Array.isArray(videoProgress)) {
        Logger.warn("Invalid videoProgress structure, resetting");
        videoProgress = {};
      }

      videoProgress = this.cleanVideoProgress(videoProgress, uniqueId);

      const existingProgress = videoProgress[uniqueId];
      const newCurrentTime = Math.floor(currentTime);
      const newDuration = Math.floor(duration);
      const newPercentage = Math.floor((currentTime / duration) * 100);

      const rewinding = context.allowRewind === true;

      if (existingProgress && !rewinding && existingProgress.currentTime > newCurrentTime) {
        return;
      }

      const MIN_ADVANCE_SECONDS = 3;
      if (
        existingProgress &&
        !rewinding &&
        existingProgress.duration === newDuration &&
        newCurrentTime - existingProgress.currentTime < MIN_ADVANCE_SECONDS
      ) {
        return;
      }

      const detectedCoverImage = context.coverImage;
      const pagePath = context.pagePath;

      let progressSaved = false;
      const applyProgressUpdate = (data, pruneForQuota = false) => {
        progressSaved = false;
        // Completion can commit while this save waits for storage. Check the same revision
        // that will receive the resume point, so a late save cannot resurrect it.
        if (this._isEpisodeAlreadyTrackedSync(uniqueId, data.animeData)) return false;
        delete data.animeData; // Read for validation; only videoProgress needs writing.
        let latestProgress = data.videoProgress;
        if (!latestProgress || typeof latestProgress !== "object" || Array.isArray(latestProgress)) latestProgress = {};
        latestProgress = this.cleanVideoProgress(latestProgress, uniqueId);

        const latestExisting = latestProgress[uniqueId];
        // Both the worker handoff and this writer preserve sample order. In particular,
        // an older start-over write must not rewind a newer pause/unload sample again.
        if (latestExisting?.sampleSession === context.sampleSession && latestExisting.sampleSequence > context.sampleSequence) return false;
        const latestRestart = Date.parse(latestExisting?.rewoundAt) || 0;
        const sampleAt = Date.parse(context.sampledAt || context.rewoundAt) || 0;
        if (sampleAt && latestRestart > sampleAt) return false;
        if (rewinding && latestExisting?.sampleSession !== context.sampleSession && latestRestart >= sampleAt && latestRestart > 0) return false;
        if (latestExisting && !rewinding && latestExisting.currentTime > newCurrentTime) {
          videoProgress = latestProgress;
          data.videoProgress = latestProgress;
          return false;
        }
        if (
          latestExisting &&
          !rewinding &&
          latestExisting.duration === newDuration &&
          newCurrentTime - latestExisting.currentTime < MIN_ADVANCE_SECONDS
        ) {
          videoProgress = latestProgress;
          data.videoProgress = latestProgress;
          return false;
        }

        const nowIso = this._compactNow();
        latestProgress[uniqueId] = {
          currentTime: newCurrentTime,
          duration: newDuration,
          savedAt: nowIso,
          percentage: newPercentage,
          watchedAt: latestExisting?.watchedAt || nowIso,
          coverImage: latestExisting?.coverImage || detectedCoverImage || undefined,
          pagePath: pagePath !== undefined ? pagePath || undefined : latestExisting?.pagePath,
          sampleSession: context.sampleSession,
          sampleSequence: context.sampleSequence,
          rewoundAt: latestRestart > (Date.parse(context.rewoundAt) || 0) ? latestExisting.rewoundAt : context.rewoundAt || undefined,
        };
        if (pruneForQuota) latestProgress = this._emergencyPruneProgress(latestProgress, uniqueId);
        data.videoProgress = latestProgress;
        videoProgress = latestProgress;
        progressSaved = true;
      };

      try {
        const mutationResult = await Storage.mutate(["videoProgress", "animeData"], (data) => applyProgressUpdate(data, false));
        if (Storage.isAbortResult(mutationResult)) return;
      } catch (err) {
        if (this._isQuotaError(err)) {
          Logger.warn("Storage quota hit — pruning videoProgress and retrying");
          try {
            const retryResult = await Storage.mutate(["videoProgress", "animeData"], (data) => applyProgressUpdate(data, true));
            if (Storage.isAbortResult(retryResult)) return;
          } catch (err2) {
            Logger.error("Retry after prune failed:", err2);
            throw err2;
          }
        } else {
          throw err;
        }
      }
      if (!progressSaved) return;
      // The one deliberate rewind has been saved; normal forward-only saving resumes.
      if (context.generation === this._generation) {
        if (rewinding) this._rewindAllowedFor = null;
        this._vpCache = videoProgress;
        this._vpCacheTime = Date.now();
      }
      Logger.debug(`Progress saved: ${uniqueId} → ${videoProgress[uniqueId].percentage}% (${newCurrentTime}s/${Math.floor(duration)}s)`);

      await this.syncProgressWatchlist(uniqueId, newCurrentTime, context);
    } catch (e) {
      if (e?.message?.includes("Extension context invalidated")) {
        Logger.debug("Save aborted: extension context invalidated");
      } else {
        Logger.error("Save progress exception:", e);
        throw e;
      }
    } finally {
      this.saveInProgress = false;
      if (this.saveQueue.length > 0 && Storage.isContextValid()) {
        setTimeout(() => {
          if (Storage.isContextValid()) this.processSaveQueue();
        }, 100);
      }
    }
  },

  saveVideoProgress(uniqueId, currentTime, duration, force = false, urgent = false, options = {}) {
    const { CONFIG, Logger } = window.AnimeTrackerContent;

    if (currentTime < CONFIG.MIN_PROGRESS_TO_SAVE) return;

    if (!force && typeof document !== "undefined" && document.visibilityState && document.visibilityState !== "visible") {
      return;
    }

    const outroStartSec = window.AnimeTrackerContent?.getCachedOutroStartSec?.() || null;
    if (!force && this.shouldMarkComplete(currentTime, duration, outroStartSec)) return;
    const context = this.captureProgressContext(uniqueId);

    const now = Date.now();
    const regularThrottleMs = Math.max(5000, Number(CONFIG.PROGRESS_WRITE_THROTTLE_MS) || 45000);
    const pauseThrottleMs = Math.max(1000, Number(CONFIG.PAUSE_WRITE_THROTTLE_MS) || 15000);
    const throttleMs = !force ? regularThrottleMs : pauseThrottleMs;

    if (!urgent && now - this.lastSaveTime < throttleMs) {
      this.pendingSeekSave = { uniqueId, currentTime, duration, context };
      const dueAt = this.lastSaveTime + throttleMs;
      // Replace the sample, not its deadline. Playback ticks used to restart a full 45-second
      // delay every five seconds, indefinitely postponing the write while playback continued.
      if (this.seekSaveTimeout && this.seekSaveDueAt <= dueAt) return;
      if (this.seekSaveTimeout) {
        clearTimeout(this.seekSaveTimeout);
      }
      this.seekSaveDueAt = dueAt;
      this.seekSaveTimeout = setTimeout(() => {
        this.seekSaveTimeout = null;
        this.seekSaveDueAt = 0;
        if (!this.pendingSeekSave) return;
        const { uniqueId: id, currentTime: time, duration: dur, context: savedContext } = this.pendingSeekSave;
        this.pendingSeekSave = null;
        // Re-run the guards instead of recursing with force=true, which would also skip
        // the visibility and completion checks and could write progress for an episode
        // that crossed the completion threshold while the save was deferred.
        if (typeof document !== "undefined" && document.visibilityState && document.visibilityState !== "visible") return;
        const deferredOutro = window.AnimeTrackerContent?.getCachedOutroStartSec?.() || null;
        if (this.shouldMarkComplete(time, dur, deferredOutro)) return;
        this.lastSavedProgress.set(id, time);
        this.lastSaveTime = Date.now();
        this.cleanLastSavedProgress();
        this.performSaveProgress(id, time, dur, savedContext).catch((e) => {
          Logger.error("Save failed", e);
        });
      }, Math.max(0, dueAt - now));
      return;
    }

    if (this.seekSaveTimeout) {
      clearTimeout(this.seekSaveTimeout);
      this.seekSaveTimeout = null;
    }
    this.pendingSeekSave = null;
    this.seekSaveDueAt = 0;

    this.lastSavedProgress.set(uniqueId, currentTime);
    this.lastSaveTime = now;
    this.cleanLastSavedProgress();

    const pct = Math.floor((currentTime / duration) * 100);
    Logger.progress(uniqueId, pct, Math.floor(currentTime));

    if (urgent && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      // Send before any await or content save queue. The worker owns this accepted
      // sample even when Safari freezes the page or navigation immediately resets us.
      try {
        chrome.runtime.sendMessage({ type: "SAVE_PROGRESS_BEFORE_UNLOAD", uniqueId, currentTime, duration,
          context, sync: options.sync !== false, forceSync: options.forceSync === true }, response => {
          const error = chrome.runtime.lastError;
          if (error || !response?.success) {
            this.performSaveProgress(uniqueId, currentTime, duration, context).catch(e => Logger.error("Urgent save failed", e));
          } else if (response.saved) {
            void this.syncProgressWatchlist(uniqueId, currentTime, context);
          }
        });
        this._vpCache = null;
        this._vpCacheTime = 0;
        if (context.allowRewind) this._rewindAllowedFor = null;
        return;
      } catch {}
    }
    this.performSaveProgress(uniqueId, currentTime, duration, context).catch((e) => {
      Logger.error("Save failed", e);
    });
  },

  async getSavedProgress(uniqueId) {
    const { Storage, Logger } = window.AnimeTrackerContent;

    try {
      const result = await Storage.get(["videoProgress"]);
      const videoProgress = result.videoProgress || {};
      const entry = videoProgress[uniqueId] || null;
      if (entry && entry.deleted) return null;
      return entry;
    } catch (e) {
      Logger.error("Exception getting progress:", e);
      return null;
    }
  },

  async clearSavedProgress(uniqueId) {
    const { Storage, Logger } = window.AnimeTrackerContent;

    if (this.seekSaveTimeout) {
      clearTimeout(this.seekSaveTimeout);
      this.seekSaveTimeout = null;
    }
    this.pendingSeekSave = null;
    this.seekSaveDueAt = 0;

    try {
      let videoProgress = null;
      const result = await Storage.mutate(["videoProgress"], (data) => {
        videoProgress = data.videoProgress || {};
        data.videoProgress = videoProgress;
        if (!videoProgress[uniqueId]) return false;
        delete videoProgress[uniqueId];
      });
      if (Storage.isAbortResult(result)) {
        Logger.warn("Skip clearSavedProgress: storage read unavailable (would clobber videoProgress)");
        return;
      }
      this._vpCache = videoProgress;
      this._vpCacheTime = Date.now();
      Logger.debug("Cleared progress for:", uniqueId);
    } catch (e) {
      Logger.error("Error clearing progress:", e);
      throw e;
    }
  },

  async isEpisodeTracked(uniqueId) {
    const { Storage, Logger } = window.AnimeTrackerContent;

    try {
      const parts = uniqueId.split("__");
      const animeSlug = parts[0];
      const episodeSlug = parts[1];

      const episodeMatch = episodeSlug.match(/episode-(\d+)/i) || episodeSlug.match(/(\d+)/);
      const episodeNumber = episodeMatch ? parseInt(episodeMatch[1], 10) : NaN;

      if (isNaN(episodeNumber)) {
        Logger.warn("Could not extract episode number from:", episodeSlug);
        return false;
      }

      const result = await Storage.get(["animeData"]);
      const animeData = result.animeData || {};
      const anime = animeData[animeSlug];

      if (!anime || !anime.episodes || !Array.isArray(anime.episodes)) {
        return false;
      }
      const listState = String(anime.listState || "").toLowerCase();
      if (anime.onHoldAt || anime.droppedAt || listState === "on_hold" || listState === "dropped") return false;

      return anime.episodes.some((ep) => {
        if (Number(ep?.number) !== episodeNumber) return false;

        if (ep?.durationSource === "anilist") return false;
        return true;
      });
    } catch (e) {
      Logger.error("Exception checking tracked episodes:", e);
      return false;
    }
  },

  async refreshTrackedEpisodeDuration(info, videoDuration) {
    const { Storage, Logger } = window.AnimeTrackerContent;

    try {
      if (!info || !info.animeSlug) return false;

      const validDuration = this.normalizeDuration(videoDuration);
      if (!validDuration) return false;

      const animeKey = info.animeSlug;
      const targetEpisode = Number(info.episodeNumber) || 0;
      const targetSecondEpisode = Number(info.secondEpisodeNumber) || 0;
      let changed = false;
      let animeData = null;
      const result = await Storage.mutate(["animeData"], (data) => {
        changed = false;
        animeData = data.animeData || {};
        data.animeData = animeData;
        const anime = animeData[animeKey];
        if (!anime || !Array.isArray(anime.episodes)) return false;

        const updateEpisodeDuration = (episodeNumber) => {
          if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) return false;

          const idx = anime.episodes.findIndex((ep) => Number(ep?.number) === episodeNumber);
          if (idx === -1) return false;

          const existing = anime.episodes[idx] || {};
          // AniList import placeholders stay untouched: promoting them here (on loadedmetadata,
          // before anything is watched) would bank the full runtime with no watchedAt.
          // EpisodeWriter promotes them properly once the episode is actually tracked.
          if (existing.durationSource === "anilist") return false;
          const currentDuration = Number(existing.duration) || 0;
          if (!this.isPlaceholderDuration(currentDuration) || currentDuration === validDuration) return false;

          anime.episodes[idx] = {
            ...existing,
            duration: validDuration,
            durationSource: "video",
          };
          changed = true;
          return true;
        };

        const updatedMain = updateEpisodeDuration(targetEpisode);
        if (info.isDoubleEpisode && targetSecondEpisode > 0) updateEpisodeDuration(targetSecondEpisode);

        if (!updatedMain && anime.episodes.length === 1) {
          const onlyEpisode = anime.episodes[0] || {};
          const onlyDuration = Number(onlyEpisode.duration) || 0;
          if (onlyEpisode.durationSource !== "anilist" && this.isPlaceholderDuration(onlyDuration) && onlyDuration !== validDuration) {
            anime.episodes[0] = {
              ...onlyEpisode,
              duration: validDuration,
              durationSource: "video",
            };
            changed = true;
          }
        }

        if (!changed) return false;
        anime.totalWatchTime = anime.episodes.reduce((sum, ep) => sum + (Number(ep?.duration) || 0), 0);
        anime.lastWatched = this._compactNow();
      });
      if (Storage.isAbortResult(result)) {
        Logger.warn("Skip refreshTrackedEpisodeDuration: storage read unavailable");
        return false;
      }
      if (!changed) return false;
      this._adCache = animeData;
      this._adCacheTime = Date.now();
      Logger.debug(`Refreshed tracked duration: ${animeKey} (${validDuration}s)`);
      return true;
    } catch (e) {
      Logger.error("Failed to refresh tracked duration:", e);
      return false;
    }
  },

  async saveWatchedEpisode(info, videoDuration) {
    const { Storage, Logger, EpisodeWriter } = window.AnimeTrackerContent;
    const { Notifications } = window.AnimeTrackerContent;

    try {
      if (!info || !info.animeSlug || !info.animeTitle || !info.episodeNumber) {
        Logger.error("Invalid episode info:", info);
        throw new Error("Invalid episode information");
      }

      if (!videoDuration || videoDuration <= 0 || isNaN(videoDuration)) {
        Logger.error("Invalid video duration:", videoDuration);
        throw new Error("Invalid video duration");
      }

      const validDuration = this.normalizeDuration(videoDuration);
      if (!validDuration) {
        Logger.error("Invalid normalized video duration:", videoDuration);
        throw new Error("Invalid normalized video duration");
      }

      let writeResult = null;
      let progressTouched = false;
      let cleanupChanged = false;
      let animeDataAfter = null;
      let videoProgressAfter = null;
      const data = await Storage.mutate(["animeData", "deletedAnime", "videoProgress"], (data) => {
        const animeData = (data.animeData = data.animeData || {});
        const deletedAnime = (data.deletedAnime = data.deletedAnime || {});
        const videoProgress = (data.videoProgress = data.videoProgress || {});

        writeResult = EpisodeWriter.writeEpisode(info, validDuration, animeData, {
          logPrefix: "saveWatchedEpisode",
        });
        progressTouched = false;
        cleanupChanged = Object.prototype.hasOwnProperty.call(deletedAnime, info.animeSlug);
        delete deletedAnime[info.animeSlug];

        const tossIds = [info.uniqueId];
        if (info.isDoubleEpisode && info.secondEpisodeNumber) {
          const base = info.uniqueId.replace(/__episode-\d+$/, "");
          tossIds.push(`${base}__episode-${info.secondEpisodeNumber}`);
        }
        for (const id of tossIds) {
          if (videoProgress[id]) {
            delete videoProgress[id];
            progressTouched = true;
          }
        }
        animeDataAfter = animeData;
        videoProgressAfter = videoProgress;
        if (!writeResult.changed && !cleanupChanged && !progressTouched) return false;
      });
      if (Storage.isAbortResult(data)) {
        Logger.error("Skip saveWatchedEpisode: storage read unavailable (would clobber animeData)");
        throw new Error("Storage read unavailable");
      }
      this._adCache = animeDataAfter;
      this._adCacheTime = Date.now();
      if (progressTouched) {
        this._vpCache = videoProgressAfter;
        this._vpCacheTime = Date.now();
      }
      if (!writeResult || !writeResult.changed) {
        Logger.debug("Episode already tracked:", info.uniqueId);
        return false;
      }
      const animeData = animeDataAfter;

      if (writeResult.changeType === "updated-placeholder") {
        Logger.debug(`Updated placeholder duration for tracked episode: ${info.uniqueId}`);
        return true;
      }

      Logger.success(`✓ Tracked: ${info.animeTitle} Ep${info.episodeNumber}${info.isDoubleEpisode ? "-" + info.secondEpisodeNumber : ""}`);
      Notifications.showCompletion(info);

      try {
        const { WatchlistSync } = window.AnimeTrackerContent;
        const siteId = animeData[info.animeSlug].siteAnimeId || info.siteAnimeId;
        if (WatchlistSync && siteId) {
          WatchlistSync.syncFromStorage(siteId, info.animeSlug, {
            fallbackType: "watching",
            keepFirstEpisodeAsPlanToWatch: true,
          });
        }
      } catch {}

      return true;
    } catch (e) {
      Logger.error("Save failed", e);
      throw e;
    }
  },

  reset() {
    this._generation++;
    if (this.seekSaveTimeout) {
      clearTimeout(this.seekSaveTimeout);
      this.seekSaveTimeout = null;
    }
    this.pendingSeekSave = null;
    this.seekSaveDueAt = 0;
    this.saveQueue = [];
    // An accepted write may still be running. Keep its lock until its finally block
    // releases it, so the next page cannot start a competing local writer.
    this.lastSavedProgress.clear();
    this.lastSaveTime = 0;
    this._vpCache = null;
    this._vpCacheTime = 0;
    this._adCache = null;
    this._adCacheTime = 0;
    this._watchlistSynced = false;
    this._rewindAllowedFor = null;
  },
};

window.AnimeTrackerContent = window.AnimeTrackerContent || {};
window.AnimeTrackerContent.ProgressTracker = ProgressTracker;

try {
  window.AnimeTrackerContent.PageEvents.onStorage(["videoProgress", "animeData"], (changes) => {
    const Util = (window.AnimeTrackerContent && window.AnimeTrackerContent.MergeUtils) || globalThis.AnimeTrackerMergeUtils || {};

    if (changes.videoProgress && ProgressTracker._vpCache) {
      const newVP = changes.videoProgress.newValue || {};
      const same = typeof Util.areProgressMapsEqual === "function" ? Util.areProgressMapsEqual(newVP, ProgressTracker._vpCache) : false;
      if (!same) {
        ProgressTracker._vpCache = null;
        ProgressTracker._vpCacheTime = 0;
      }
    }

    if (changes.animeData && ProgressTracker._adCache) {
      const newAD = changes.animeData.newValue || {};
      const same = typeof Util.areAnimeDataMapsEqual === "function" ? Util.areAnimeDataMapsEqual(newAD, ProgressTracker._adCache) : false;
      if (!same) {
        ProgressTracker._adCache = null;
        ProgressTracker._adCacheTime = 0;
      }
    }
  });
} catch {}
