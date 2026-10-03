// video-monitor.js — per-video progress work: the resume prompt, auto and silent resume, the periodic
// save and the unload hooks. PlayerObserver finds the video and delivers its events.
const VideoMonitor = {
  videoElement: null,
  progressSaveInterval: null,
  cleanupFunctions: [],
  silentResumeFor: null,
  silentResumeTime: 0,

  armSilentResume(uniqueId, resumeTime = 0) {
    this.silentResumeFor = uniqueId || null;
    this.silentResumeTime = Number.isFinite(resumeTime) && resumeTime > 0 ? resumeTime : 0;
  },

  // A server switch replaces the <video>: drop this one's state and let PlayerObserver find the next.
  rebindAfterServerSwitch() {
    const { Logger, PlayerObserver } = window.AnimeTrackerContent;
    Logger.debug("VideoMonitor: rebinding after server switch");
    this.cleanup();
    PlayerObserver.rescan();
  },

  // Per-video cleanups: released by cleanup(), which runs on every video (re)bind.
  addCleanup(fn) {
    this.cleanupFunctions.push(fn);
  },

  // Page-lifetime cleanups: released only by cleanupPage(), which init() calls. These used to share the
  // per-video list, so binding a late-loading video or rebinding after a server switch also removed the
  // server-switch click listener, the periodic completion check and the server watchers. After the
  // first switch nothing re-registered them, so the second switch never rebound the monitor and no
  // progress was saved for the rest of the episode.
  addPageCleanup(fn) {
    if (!this.pageCleanupFunctions) this.pageCleanupFunctions = [];
    this.pageCleanupFunctions.push(fn);
  },

  cleanupPage() {
    const { Logger } = window.AnimeTrackerContent;
    const fns = this.pageCleanupFunctions || [];
    this.pageCleanupFunctions = [];
    for (const fn of fns) {
      try {
        fn();
      } catch (e) {
        Logger.error("Page cleanup error:", e);
      }
    }
  },

  cleanup() {
    const { Logger } = window.AnimeTrackerContent;

    this.cleanupFunctions.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        Logger.error("Cleanup error:", e);
      }
    });
    this.cleanupFunctions = [];

    if (this.progressSaveInterval) {
      clearInterval(this.progressSaveInterval);
      this.progressSaveInterval = null;
    }

    this.videoElement = null;
  },

  // Called by PlayerObserver for each newly bound video. Its media events reach eventHandlers through
  // the subscriptions made in startWatching; this sets up everything else tied to one element.
  async setupVideoMonitoring(video, animeInfo, eventHandlers) {
    const { CONFIG, Logger, ProgressTracker, Notifications, PlayerDom } = window.AnimeTrackerContent;

    if (this.videoElement === video && PlayerDom.isVideoActive(video)) return;

    this.cleanup();

    if (!PlayerDom.isVideoActive(video)) {
      Logger.debug("Video not ready");
      return;
    }

    this.videoElement = video;

    if (eventHandlers.handleVideoMetadata) {
      Promise.resolve().then(() => eventHandlers.handleVideoMetadata());
    }

    document.addEventListener("visibilitychange", eventHandlers.handleVisibilityChange, { passive: true });
    window.addEventListener("beforeunload", eventHandlers.handleBeforeUnload);
    window.addEventListener("pagehide", eventHandlers.handleBeforeUnload, { passive: true });

    this.addCleanup(() => {
      document.removeEventListener("visibilitychange", eventHandlers.handleVisibilityChange);
      window.removeEventListener("beforeunload", eventHandlers.handleBeforeUnload);
      window.removeEventListener("pagehide", eventHandlers.handleBeforeUnload);
    });

    if (animeInfo) {
      const armedFor = this.silentResumeFor;
      if (armedFor && armedFor === animeInfo.uniqueId) {
        this.silentResumeFor = null;
        const armedTime = this.silentResumeTime || 0;
        this.silentResumeTime = 0;
        const resumeAt = armedTime;
        if (resumeAt > CONFIG.MIN_PROGRESS_TO_SAVE) {
          let attempt = 0;
          const MAX = 30;
          const seek = () => {
            if (!this.videoElement || this.videoElement !== video) return;
            if (video.readyState >= 2 && video.duration > 0) {
              const target = Math.min(resumeAt, Math.max(0, video.duration - 1));
              if (Math.abs((video.currentTime || 0) - target) < 5) {
                Logger.debug(`Server switch: new video already at ~${Math.round(target)}s, skipping seek`);
                return;
              }
              try {
                video.currentTime = target;
                video.play().catch(() => {});
                Logger.success(`Server switch: silently resumed @ ${Math.round(target)}s`);
              } catch (err) {
                Logger.warn("Silent resume seek failed:", err);
              }
            } else if (attempt++ < MAX) {
              setTimeout(seek, 500);
            } else {
              Logger.debug("Silent resume gave up (video never became ready)");
            }
          };
          setTimeout(seek, 300);
        }
      } else {
        window.__atResumeShownFor = window.__atResumeShownFor || new Set();
        const promptKey = animeInfo.uniqueId;

        let resumePromptShown = false;
        let autoResumeEnabled = false;
        try {
          const pref = await chrome.storage.local.get(["autoResumeEnabled"]);
          autoResumeEnabled = pref.autoResumeEnabled === true;
        } catch {}
        const autoResume = (savedProgress) => {
          if (resumePromptShown) return;
          resumePromptShown = true;
          window.__atResumeShownFor.add(promptKey);
          let tries = 0;
          const seek = () => {
            if (!this.videoElement || this.videoElement !== video) return;
            if (video.readyState >= 2 && video.duration > 0) {
              const target = Math.min(savedProgress.currentTime, Math.max(0, video.duration - 1));
              try {
                video.currentTime = target;
                video.play().catch(() => {});
                Logger.success(`Auto-resumed @ ${Math.round(target)}s`);
              } catch (err) {
                Logger.warn("Auto-resume seek failed:", err);
              }
            } else if (tries++ < 20) {
              setTimeout(seek, 500);
            }
          };
          setTimeout(seek, 500);
        };

        const showPromptOnce = (savedProgress) => {
          if (resumePromptShown) return;
          if (window.__atResumeShownFor.has(promptKey)) {
            resumePromptShown = true;
            return;
          }
          if (!savedProgress || !(savedProgress.currentTime > CONFIG.MIN_PROGRESS_TO_SAVE)) return;

          const here = video.currentTime || 0;
          if (here > 0 && Math.abs(here - savedProgress.currentTime) < 5) return;
          if (here > savedProgress.currentTime) return;

          if (autoResumeEnabled) {
            autoResume(savedProgress);
            return;
          }

          resumePromptShown = true;
          window.__atResumeShownFor.add(promptKey);
          savedProgress.uniqueId = animeInfo.uniqueId;

          let retryCount = 0;
          const MAX_RETRIES = 20;
          const checkReady = () => {
            if (!this.videoElement || this.videoElement !== video) return;
            if (video.readyState >= 2 && video.duration > 0) {
              Notifications.showResumePrompt(
                savedProgress,
                () => {
                  // Same clamp as the silent and auto resume paths: a saved position at or past the
                  // end (stale entry, or a server swap to a shorter encode) would otherwise seek to
                  // the end and instantly re-complete the episode.
                  const target = Math.min(savedProgress.currentTime, Math.max(0, video.duration - 1));
                  video.currentTime = target;
                  video.play().catch(() => {});
                  Logger.success(`Resumed @ ${Math.round(target)}s`);
                },
                () => {
                  window.AnimeTrackerContent.ProgressTracker?.allowRewind?.(savedProgress.uniqueId);
                  video.currentTime = 0;
                  video.play().catch(() => {});
                },
              );
            } else {
              retryCount++;
              if (retryCount < MAX_RETRIES) {
                setTimeout(checkReady, 500);
              } else {
                Logger.debug(`Video not ready after ${MAX_RETRIES} retries`);
              }
            }
          };
          setTimeout(checkReady, 1000);
        };

        const initialProgress = await ProgressTracker.getSavedProgress(animeInfo.uniqueId);
        if (initialProgress && initialProgress.currentTime > CONFIG.MIN_PROGRESS_TO_SAVE) {
          showPromptOnce(initialProgress);
        } else {
          // Cloud sync can deliver this episode's saved position shortly after the page opens.
          const RESUME_LISTEN_WINDOW_MS = 15000;
          const SAME_POSITION_TOLERANCE = 5;

          const stopListening = () => {
            unsubscribe();
            clearTimeout(resumeWaitTimer);
          };
          const unsubscribe = window.AnimeTrackerContent.PageEvents.onStorage("videoProgress", (changes) => {
            const entry = (changes.videoProgress.newValue || {})[animeInfo.uniqueId];
            if (!entry || entry.deleted) return;
            if (!(entry.currentTime > CONFIG.MIN_PROGRESS_TO_SAVE)) return;

            const livePos = video.currentTime || 0;
            if (livePos > 0 && Math.abs(livePos - entry.currentTime) < SAME_POSITION_TOLERANCE) {
              return;
            }

            stopListening();
            showPromptOnce(entry);
          });
          const resumeWaitTimer = setTimeout(stopListening, RESUME_LISTEN_WINDOW_MS);
          this.addCleanup(stopListening);
        }
      }
    }

    let _lastSavedTime = -1;
    const tickSave = () => {
      const v = this.videoElement;
      if (!v || !animeInfo || v.paused) return;
      const currentTime = v.currentTime;
      const duration = v.duration;
      if (!(currentTime > 0) || !(duration > 0)) return;
      const floored = Math.floor(currentTime);
      if (floored === _lastSavedTime) return;
      _lastSavedTime = floored;
      ProgressTracker.saveVideoProgress(animeInfo.uniqueId, currentTime, duration);
    };

    const startSaveInterval = () => {
      if (this.progressSaveInterval) return;
      this.progressSaveInterval = setInterval(tickSave, CONFIG.PROGRESS_SAVE_INTERVAL);
    };
    const stopSaveInterval = () => {
      if (this.progressSaveInterval) {
        clearInterval(this.progressSaveInterval);
        this.progressSaveInterval = null;
      }
    };

    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startSaveInterval();
    }
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") startSaveInterval();
      else stopSaveInterval();
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    this.addCleanup(() => {
      stopSaveInterval();
      document.removeEventListener("visibilitychange", visibilityHandler);
    });

    Logger.debug("Video monitoring active");
  },

  // Routes the page's handlers to PlayerObserver for this page and (re)starts the video search. Every
  // subscription is page-lifetime: a server switch rebinds the video but keeps the subscriptions.
  startWatching(animeInfo, eventHandlers) {
    const { PlayerObserver, Logger } = window.AnimeTrackerContent;
    Logger.debug("Looking for video...");
    PlayerObserver.stop();
    const subscriptions = [
      PlayerObserver.on("timeupdate", eventHandlers.handleTimeUpdate),
      PlayerObserver.on("metadata", eventHandlers.handleVideoMetadata),
      PlayerObserver.on("pause", eventHandlers.handlePause),
      PlayerObserver.on("seeked", eventHandlers.handleSeeked),
      PlayerObserver.on("ended", eventHandlers.handleEnded),
      PlayerObserver.on("video", (video) => this.setupVideoMonitoring(video, animeInfo, eventHandlers)),
    ];
    this.addPageCleanup(() => subscriptions.forEach((unsubscribe) => unsubscribe()));
    PlayerObserver.start();
  },

  getVideoElement() {
    return this.videoElement;
  },
};

window.AnimeTrackerContent = window.AnimeTrackerContent || {};
window.AnimeTrackerContent.VideoMonitor = VideoMonitor;
