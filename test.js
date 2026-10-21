// YT & YTM Nonstop Solo v2.0.0 - console test
// Paste into the DevTools Console on a music.youtube.com tab that was loaded
// AFTER the extension. If Firefox blocks pasting, type: allow pasting  (Enter) first.
// Reload the tab after the test (it adds and removes fake page elements).
(async () => {
  const GOOD = "color:#2ecc71;font-weight:bold";
  const BAD = "color:#e74c3c;font-weight:bold";
  const INFO = "color:#3498db;font-weight:bold";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let failed = 0;
  const check = (name, pass, detail = "") => {
    if (!pass) failed++;
    console.log(`%c[TEST] ${pass ? "PASS" : "FAIL"} - ${name} ${detail}`, pass ? GOOD : BAD);
  };

  // Builds a fake "Are you still there?" popup. The real component wipes children
  // added before it is attached, so attach first, then add the button.
  const buildMockPopup = () => {
    const popup = document.createElement("ytmusic-you-there-renderer");
    document.body.appendChild(popup);
    const actions = document.createElement("div");
    actions.className = "actions";
    const yes = document.createElement("button");
    yes.textContent = "Yes";
    const state = { clicked: false };
    yes.addEventListener("click", () => (state.clicked = true));
    actions.appendChild(yes);
    popup.appendChild(actions);
    return { popup, state };
  };

  const video = document.querySelector("video");

  // --- Stage 1: injection and visibility spoof (page script) ---
  check("Page script injected (once-only guard set)", window.__ynsInjected === true);
  check(
    "Visibility API spoofed",
    document.hidden === false && document.visibilityState === "visible"
  );

  // --- Stage 2: heartbeat ---
  console.log(
    "%c[TEST] Stage 2: the heartbeat runs in the page every 5 minutes and cannot be triggered from here. " +
      "Leave the tab open and look for '[YT-Nonstop-Debug] ... Activity heartbeat sent' after 5 minutes. " +
      "Afterwards, window._lact should be a recent timestamp.",
    INFO
  );

  // --- Stage 3: popup handler via the 'yt-popup-opened' event ---
  const testBackdrop = document.createElement("tp-yt-iron-overlay-backdrop");
  testBackdrop.className = "opened";
  document.body.appendChild(testBackdrop);
  const backdropsBefore = document.querySelectorAll("tp-yt-iron-overlay-backdrop").length;

  const eventTest = buildMockPopup();
  if (video) video.pause();
  console.log("%c[TEST] Stage 3: firing 'yt-popup-opened'...", INFO);
  document.dispatchEvent(new CustomEvent("yt-popup-opened", {}));
  await sleep(1500);

  check("Event path: confirm button was clicked", eventTest.state.clicked);
  check("Event path: fake backdrop was removed", !testBackdrop.isConnected);
  const backdropsAfter = document.querySelectorAll("tp-yt-iron-overlay-backdrop").length;
  if (testBackdrop.isConnected && backdropsAfter < backdropsBefore) {
    console.log(
      "%c[TEST] WARN - the handler removed a pre-existing backdrop, not the fake one. Reload the tab to restore the page UI.",
      BAD
    );
  }
  if (video) {
    check(
      "Event path: video resumed after the popup",
      !video.paused,
      video.paused ? "(if the page logged play() failed, allow Autoplay for this site)" : ""
    );
  } else {
    console.log("%c[TEST] No <video> element found, skipping resume check.", INFO);
  }

  eventTest.popup.remove();
  if (testBackdrop.isConnected) testBackdrop.remove();

  // --- Stage 4: popup handler via the MutationObserver fallback (no event fired) ---
  // Wait out the handler's 1.5 s lock from stage 3 first.
  await sleep(1000);
  console.log("%c[TEST] Stage 4: adding a popup WITHOUT firing any event...", INFO);
  const observerTest = buildMockPopup();
  await sleep(1500);

  check("Observer path: confirm button was clicked", observerTest.state.clicked);
  observerTest.popup.remove();

  // --- Stage 5: an unrelated popup must be ignored (no dialog in the page) ---
  await sleep(1000);
  console.log("%c[TEST] Stage 5: firing 'yt-popup-opened' with NO still-there dialog...", INFO);
  const ignoreBackdrop = document.createElement("tp-yt-iron-overlay-backdrop");
  ignoreBackdrop.className = "opened";
  document.body.appendChild(ignoreBackdrop);
  if (video) video.pause();
  document.dispatchEvent(new CustomEvent("yt-popup-opened", {}));
  await sleep(2000);
  check("Unrelated popup: backdrop left alone", ignoreBackdrop.isConnected);
  if (video) check("Unrelated popup: playback not resumed", video.paused);
  ignoreBackdrop.remove();

  console.log(
    `%c[TEST] Done. ${failed === 0 ? "All checks passed." : failed + " check(s) failed."}`,
    failed === 0 ? GOOD : BAD
  );
})();

// --- Not covered here: the stall watchdog ---
// Test it separately: DevTools -> Network -> right-click a videoplayback request
// -> Block URL, skip to the next track, then watch for '[YT-Nonstop-Debug] Watchdog'
// lines at ~15 s (Next/Previous nudge) and ~30 s (tab reload). After the reload,
// unblock the URL. Timers can run late in background tabs.