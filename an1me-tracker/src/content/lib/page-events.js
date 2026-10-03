// page-events.js — one chrome.storage.onChanged listener and one MutationObserver, shared by every
// content script in this frame. Several manifest entries load this file into the same frame, so it
// installs once.
(function () {
  "use strict";

  const AT = (window.AnimeTrackerContent = window.AnimeTrackerContent || {});
  if (AT.PageEvents) return;

  const report = (context, error) => {
    try {
      globalThis.__atSwallow?.(context, error);
    } catch {}
  };

  // ---- storage ----

  const storageSubscribers = new Set();
  let storageListener = null;

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local") return;
    for (const subscriber of [...storageSubscribers]) {
      if (!storageSubscribers.has(subscriber)) continue;
      if (!Object.keys(changes).some(subscriber.matches)) continue;
      try {
        subscriber.callback(changes);
      } catch (error) {
        report("PageEvents.onStorage", error);
      }
    }
  }

  // Calls callback(changes) when chrome.storage.local changes one of keys (a key, a list of keys, or a
  // predicate over the changed key). Returns an unsubscribe.
  function onStorage(keys, callback) {
    const wanted = typeof keys === "function" ? null : new Set(Array.isArray(keys) ? keys : [keys]);
    const subscriber = { matches: wanted ? (key) => wanted.has(key) : keys, callback };
    storageSubscribers.add(subscriber);
    if (!storageListener) {
      storageListener = handleStorageChange;
      try {
        chrome.storage.onChanged.addListener(storageListener);
      } catch (error) {
        report("PageEvents.addStorageListener", error);
      }
    }
    return () => {
      storageSubscribers.delete(subscriber);
      if (storageSubscribers.size > 0 || !storageListener) return;
      try {
        chrome.storage.onChanged.removeListener(storageListener);
      } catch {}
      storageListener = null;
    };
  }

  // ---- DOM mutations ----

  const domSubscribers = new Set();
  let observer = null;

  function recordMatches(subscriber, record) {
    const { target, options } = subscriber;
    if (record.type === "childList" && !options.childList) return false;
    if (record.type === "attributes") {
      if (!options.attributes) return false;
      if (options.attributeFilter && !options.attributeFilter.includes(record.attributeName)) return false;
    }
    if (record.target === target) return true;
    return options.subtree === true && typeof target.contains === "function" && target.contains(record.target);
  }

  function runSubscriber(subscriber) {
    if (!domSubscribers.has(subscriber)) return;
    try {
      subscriber.callback();
    } catch (error) {
      report("PageEvents.observe", error);
    }
  }

  function deliver(records) {
    for (const subscriber of [...domSubscribers]) {
      if (subscriber.scheduled || !domSubscribers.has(subscriber)) continue;
      if (!records.some((record) => recordMatches(subscriber, record))) continue;
      if (subscriber.throttleMs > 0) {
        subscriber.scheduled = setTimeout(() => {
          subscriber.scheduled = null;
          runSubscriber(subscriber);
        }, subscriber.throttleMs);
      } else {
        runSubscriber(subscriber);
      }
    }
  }

  // One observer watches every subscribed target; options asked for the same target are merged.
  function reconnect() {
    if (!observer) observer = new MutationObserver(deliver);
    const pending = observer.takeRecords();
    observer.disconnect();
    if (pending.length > 0) deliver(pending);

    const merged = new Map();
    for (const { target, options } of domSubscribers) {
      const current = merged.get(target) || { childList: false, subtree: false, attributes: false, attributeFilter: null };
      current.childList ||= options.childList === true;
      current.subtree ||= options.subtree === true;
      if (options.attributes) {
        // Unfiltered attribute watching by any subscriber means no filter for the target.
        if (!current.attributes) current.attributeFilter = options.attributeFilter ? [...options.attributeFilter] : null;
        else if (current.attributeFilter && options.attributeFilter) current.attributeFilter = [...new Set([...current.attributeFilter, ...options.attributeFilter])];
        else current.attributeFilter = null;
        current.attributes = true;
      }
      merged.set(target, current);
    }
    for (const [target, options] of merged) {
      const init = { childList: options.childList, subtree: options.subtree };
      if (options.attributes) {
        init.attributes = true;
        if (options.attributeFilter) init.attributeFilter = options.attributeFilter;
      }
      try {
        observer.observe(target, init);
      } catch (error) {
        report("PageEvents.reconnect", error);
      }
    }
  }

  // Calls callback() after mutations of target matching options (MutationObserver options: childList,
  // subtree, attributes, attributeFilter). With throttleMs, at most one call per throttleMs, run that
  // long after the first mutation. With timeoutMs, the subscription ends by itself. Returns an
  // unsubscribe.
  function observe(target, options, callback, { throttleMs = 0, timeoutMs = 0 } = {}) {
    if (!target) return () => {};
    const subscriber = { target, options: { ...options }, callback, throttleMs, scheduled: null, expiry: null };
    domSubscribers.add(subscriber);
    reconnect();

    const unsubscribe = () => {
      if (!domSubscribers.delete(subscriber)) return;
      clearTimeout(subscriber.scheduled);
      clearTimeout(subscriber.expiry);
      if (domSubscribers.size === 0) {
        observer?.disconnect();
      } else {
        reconnect();
      }
    };
    if (timeoutMs > 0) subscriber.expiry = setTimeout(unsubscribe, timeoutMs);
    return unsubscribe;
  }

  // Resolves with the first element matching selector, or null after timeoutMs.
  function waitFor(selector, timeoutMs, root = document) {
    return new Promise((resolve) => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);
      let settled = false;
      const finish = (node) => {
        if (settled) return;
        settled = true;
        stop();
        clearTimeout(timer);
        resolve(node);
      };
      const stop = observe(root.documentElement || root, { childList: true, subtree: true }, () => {
        const node = root.querySelector(selector);
        if (node) finish(node);
      });
      const timer = setTimeout(() => finish(null), timeoutMs);
    });
  }

  function stats() {
    return { storageSubscribers: storageSubscribers.size, domSubscribers: domSubscribers.size };
  }

  AT.PageEvents = Object.freeze({ onStorage, observe, waitFor, stats });
})();
