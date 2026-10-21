(function () {
  const tag = "[YT-Nonstop-Debug]";
  const log = (msg, data = "") =>
    console.log(`${tag} ${new Date().toLocaleTimeString()} | ${msg}`, data);

  // 1 + 2. Page-context script: visibility spoof, activity heartbeat, popup handler.
  // Runs in the page's own world so window._lact is YouTube's real variable.
  const ynsInjection = `
  (function () {
    if (window.__ynsInjected) return;
    window.__ynsInjected = true;

    const debugLog = (msg) => console.log("[YT-Nonstop-Debug] " + new Date().toLocaleTimeString() + " | " + msg);

    // Keep background tab "visible"
    try {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      debugLog("System: Visibility API spoofed to 'always visible'.");
    } catch (e) {
      debugLog("Warning: Visibility spoof failed: " + e.message);
    }

    // Activity heartbeat (every 5 min)
    setInterval(() => {
      window._lact = Date.now();
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      debugLog("Status: Activity heartbeat sent (_lact + mousemove).");
    }, 300000);

    let handling = false;
    function handlePopup(source) {
      if (handling) return;

      // Only act on a real "still there?" dialog. YouTube fires 'yt-popup-opened'
      // for every popup (menus, toasts, error messages); those must be left alone.
      const dialog = document.querySelector('ytmusic-you-there-renderer, yt-confirm-dialog-renderer');
      if (!dialog) {
        // The dialog may be attached a moment after the event, so look once more.
        if (source === "yt-popup-opened") setTimeout(() => handlePopup("recheck"), 400);
        return;
      }

      handling = true;
      setTimeout(() => { handling = false; }, 1500);
      debugLog("Event: still-there dialog detected via " + source + ". Searching for confirmation elements...");

      let clicked = false;
      const confirmBtn = document.querySelector(
        'ytmusic-you-there-renderer .actions button, ytmusic-you-there-renderer [role="button"], ' +
        'yt-confirm-dialog-renderer #confirm-button button, yt-confirm-dialog-renderer #confirm-button'
      );

      if (confirmBtn) {
        debugLog("Action: Found confirmation button. Executing .click().");
        confirmBtn.click();
        clicked = true;
      } else {
        debugLog("Warning: no standard button found. Trying text-based fallback.");
        document.querySelectorAll('ytmusic-you-there-renderer button, yt-confirm-dialog-renderer button').forEach(btn => {
          if (/Yes|Confirm|Still/i.test(btn.innerText)) {
            btn.click();
            clicked = true;
            debugLog("Action: Clicked button via text match: " + btn.innerText);
          }
        });
      }

      const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop.opened') ||
                       document.querySelector('tp-yt-iron-overlay-backdrop');
      if (backdrop) {
        backdrop.remove();
        debugLog("Action: UI Backdrop element removed.");
      }

      // Resume only if we actually confirmed the dialog (and there is a network to resume on).
      if (!clicked || !navigator.onLine) return;
      setTimeout(() => {
        const video = document.querySelector('video');
        if (video && video.paused) {
          debugLog("Action: Video paused by system. Attempting Playback Resume...");
          video.play().catch(() => {
            debugLog("Error: HTML5 play() failed. Attempting Player API fallback.");
            const player = document.querySelector('#movie_player') || document.querySelector('ytmusic-app');
            if (player && player.playVideo) player.playVideo();
          });
        } else {
          debugLog("Status: Playback is already active.");
        }
      }, 500);
    }

    document.addEventListener('yt-popup-opened', () => handlePopup("yt-popup-opened"));

    // Fallback: catch the dialog even if the event is never fired
    const startObserver = () => {
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && n.matches &&
                (n.matches('ytmusic-you-there-renderer, yt-confirm-dialog-renderer') ||
                 n.querySelector('ytmusic-you-there-renderer, yt-confirm-dialog-renderer'))) {
              setTimeout(() => handlePopup("MutationObserver"), 300);
              return;
            }
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    };
    startObserver();
  })();
  `;

  const script = document.createElement("script");
  script.textContent = ynsInjection;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  log("System: Content script successfully injected.");

  // 3. Stall Watchdog (YouTube Music only)
  if (location.hostname !== "music.youtube.com") return;

  // ESCALATION FLOW:
  //   15 s -> Nudge (Next + Previous)
  //   30 s -> Refresh (Reload tab)
  //   15 s -> Next Song (Skip) if the track stalled again after the refresh
  const CHECK_MS = 5000;
  const NUDGE_AFTER_MS = 15000;
  const RELOAD_AFTER_MS = 30000;
  const REPEAT_SKIP_MS = 15000;

  const MAX_ATTEMPTS = 3;
  const BUDGET_WINDOW_MS = 15 * 60 * 1000;
  const BACKOFF_MS = 60 * 1000; // quiet period after the attempt limit blocks an action

  const ATTEMPTS_KEY = "ytns_attempts";
  const RESUME_KEY = "ytns_resume";
  const SNAP_KEY = "ytns_last_snapshot";
  const STALLED_TRACK_KEY = "ytns_stalled_track";

  let lastTime = -1;
  let lastProgressAt = Date.now();
  let nudgeTried = false;
  let skipTried = false;
  let backoffUntil = 0;
  let wasOffline = false;

  function snapshot(video, stuckFor) {
    const buffered = [];
    for (let i = 0; i < video.buffered.length; i++) {
      buffered.push(
        `${video.buffered.start(i).toFixed(1)}-${video.buffered.end(i).toFixed(1)}`,
      );
    }
    return {
      time: new Date().toLocaleTimeString(),
      stuckForSec: Math.round(stuckFor / 1000),
      url: location.href,
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      ended: video.ended,
      readyState: video.readyState,
      networkState: video.networkState,
      hasSrc: !!video.currentSrc,
      buffered: buffered.join(", ") || "none",
      error: video.error ? `${video.error.code}: ${video.error.message}` : null,
      youThereVisible: !!document.querySelector("ytmusic-you-there-renderer"),
      adShowing: !!document.querySelector(
        ".ad-showing, .ytp-ad-player-overlay",
      ),
      repeatStall: isRepeatStall(),
      spinnerVisible: (() => {
        const sp = document.querySelector(
          "ytmusic-player-bar .spinner-container",
        );
        return !!sp && !sp.hasAttribute("hidden");
      })(),
      playButtonTitle:
        document
          .querySelector("ytmusic-player-bar #play-pause-button")
          ?.getAttribute("title") ?? null,
    };
  }

  function findPlayerBarButton(selector) {
    const host = document.querySelector(`ytmusic-player-bar ${selector}`);
    return host && (host.querySelector("button") || host);
  }

  function clickPlayerBarButton(selector) {
    const btn = findPlayerBarButton(selector);
    if (!btn) return false;
    btn.click();
    return true;
  }

  // Rolling-window limiter shared by reloads and skips (stored per tab).
  function takeAttemptBudget() {
    let list = [];
    try {
      list = JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) || "[]");
    } catch (e) {}
    const now = Date.now();
    list = list.filter((t) => now - t < BUDGET_WINDOW_MS);
    if (list.length >= MAX_ATTEMPTS) return false;
    list.push(now);
    try {
      sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(list));
    } catch (e) {}
    return true;
  }

  // --- Memory of a track that caused a reload ---
  function currentVideoId() {
    try {
      return new URL(location.href).searchParams.get("v");
    } catch (e) {
      return null;
    }
  }

  function readStalledTrack() {
    try {
      return JSON.parse(sessionStorage.getItem(STALLED_TRACK_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function markStalledTrack() {
    const id = currentVideoId();
    if (!id) return;
    const prev = readStalledTrack();
    const n = prev && prev.id === id ? prev.n + 1 : 1;
    try {
      sessionStorage.setItem(STALLED_TRACK_KEY, JSON.stringify({ id, n }));
    } catch (e) {}
  }

  function clearStalledTrack() {
    try {
      sessionStorage.removeItem(STALLED_TRACK_KEY);
    } catch (e) {}
  }

  function isRepeatStall() {
    const rec = readStalledTrack();
    return !!rec && rec.id === currentVideoId() && rec.n >= 1;
  }

  let stalledTrackPending = !!readStalledTrack();

  function nudgeTrack() {
    if (!clickPlayerBarButton(".next-button")) {
      log("Watchdog: Next button not found, skipping nudge.");
      return;
    }
    log("Watchdog: clicked Next. Going back with Previous shortly.");
    setTimeout(() => {
      if (clickPlayerBarButton(".previous-button")) {
        log("Watchdog: clicked Previous (back on the original track).");
      } else {
        log("Watchdog: Previous button not found.");
      }
    }, 2000);
  }

  function skipTrack(reason) {
    if (!findPlayerBarButton(".next-button")) {
      log("Watchdog: Next button not found, cannot skip.");
      return false;
    }
    if (!takeAttemptBudget()) {
      log("Watchdog: Attempt limit reached. Not skipping.");
      return false;
    }
    clickPlayerBarButton(".next-button");
    log(`Watchdog: skipped to the next track (${reason}).`);
    lastProgressAt = Date.now();
    nudgeTried = false;
    skipTried = false;
    return true;
  }

  function couldBeStalled(video) {
    if (video.ended) return false;
    if (video.paused && video.readyState >= 3) return false;
    return true;
  }

  // content.js now runs at document_start, so wait for the DOM before
  // the watchdog starts looking for the <video> element.
  setInterval(() => {
    const video = document.querySelector("video");
    if (!video) return;

    const now = Date.now();

    // Offline: a reload would land on an error page and end the loop, so wait.
    if (!navigator.onLine) {
      if (!wasOffline) {
        wasOffline = true;
        log("Watchdog: offline. Pausing recovery until the connection is back.");
      }
      lastProgressAt = now;
      nudgeTried = false;
      skipTried = false;
      return;
    }
    if (wasOffline) {
      wasOffline = false;
      log("Watchdog: back online. Resuming checks.");
    }

    // Quiet period after the attempt limit blocked an action.
    if (now < backoffUntil) return;

    if (video.currentTime !== lastTime || !couldBeStalled(video)) {
      lastTime = video.currentTime;
      lastProgressAt = now;
      nudgeTried = false;
      skipTried = false;
      // 15 s of healthy playback clears the memory of a bad track.
      if (stalledTrackPending && video.currentTime > 15) {
        clearStalledTrack();
        stalledTrackPending = false;
      }
      return;
    }

    const stuckFor = now - lastProgressAt;
    const secs = Math.round(stuckFor / 1000);

    if (isRepeatStall()) {
      if (stuckFor >= REPEAT_SKIP_MS && !skipTried) {
        skipTried = true;
        log(
          `Watchdog: Track stalled again after refresh. Skipping at ${secs}s.`,
          snapshot(video, stuckFor),
        );
        if (!skipTrack("Track stalled again after a refresh")) {
          // Limit reached or Next button missing: wait 1 minute, then try again.
          // Keeps retrying until the 15-minute window frees a slot.
          lastProgressAt = now + 45000;
          skipTried = false;
        }
      }
    } else {
      if (stuckFor >= RELOAD_AFTER_MS) {
        if (takeAttemptBudget()) {
          const snap = snapshot(video, stuckFor);
          log(`Watchdog: stalled ${secs}s. Refreshing tab.`, snap);
          markStalledTrack();
          try {
            sessionStorage.setItem(RESUME_KEY, "1");
            sessionStorage.setItem(SNAP_KEY, JSON.stringify(snap));
          } catch (e) {}
          location.reload();
        } else {
          log(
            "Watchdog: Stalled, but 3-attempt limit reached. Not refreshing.",
          );
          backoffUntil = now + BACKOFF_MS; // retry once the 15-minute window frees a slot
        }
      } else if (stuckFor >= NUDGE_AFTER_MS && !nudgeTried) {
        nudgeTried = true;
        log(
          `Watchdog: stalled at ${secs}s. Nudging track.`,
          snapshot(video, stuckFor),
        );
        nudgeTrack();
      }
    }
  }, CHECK_MS);

  // After a watchdog reload, start playback again. If play attempts fail,
  // skip to the next track (the current one may be the problem).
  if (sessionStorage.getItem(RESUME_KEY)) {
    sessionStorage.removeItem(RESUME_KEY);
    try {
      const saved = sessionStorage.getItem(SNAP_KEY);
      if (saved)
        log(
          "Watchdog: snapshot from the stall that caused this reload:",
          JSON.parse(saved),
        );
    } catch (e) {}
    const MAX_RESUME_TRIES = 3;
    const MAX_RESUME_TICKS = 20;
    let tries = 0;
    let ticks = 0;
    const resume = setInterval(() => {
      if (!navigator.onLine) return; // wait for the connection; don't burn attempts
      ticks++;
      const v = document.querySelector("video");
      if (v && !v.paused && v.currentTime > 0) {
        log("Watchdog: playback resumed after reload.");
        clearInterval(resume);
        return;
      }
      const btn = findPlayerBarButton("#play-pause-button");
      if (btn && v && v.paused && tries < MAX_RESUME_TRIES) {
        tries++;
        log(
          `Watchdog: clicking play after reload (try ${tries}/${MAX_RESUME_TRIES}).`,
        );
        btn.click();
        v.play().catch((err) =>
          log(`Watchdog: play() rejected: ${err.name} - ${err.message}`),
        );
        return;
      }
      if (tries >= MAX_RESUME_TRIES) {
        clearInterval(resume);
        log(
          "Watchdog: play attempts did not start playback. If play() reported NotAllowedError, " +
            "set Autoplay to 'Allow Audio and Video' for music.youtube.com.",
        );
        skipTrack("play attempts after reload failed");
        return;
      }
      if (ticks >= MAX_RESUME_TICKS) clearInterval(resume);
    }, 3000);
  }

  log("System: Stall watchdog active.");
})();