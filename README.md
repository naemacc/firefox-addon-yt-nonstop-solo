<div align="center">

<img src="icons/icon-128.png" alt="Nonstop for YouTube & YouTube Music icon" width="96" height="96">



# Nonstop for YouTube & YouTube Music

**Keep YouTube and YouTube Music playing in a background tab, and recover automatically when a track stalls.**

[![Get the add-on](https://img.shields.io/badge/Firefox-Get%20the%20add--on-FF7139?logo=firefox-browser&logoColor=white&style=for-the-badge)](https://addons.mozilla.org/en-US/firefox/addon/nonstop-for-youtube-music/)

![Firefox 142+](https://img.shields.io/badge/Firefox-142%2B-orange?logo=firefox-browser&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![No data collected](https://img.shields.io/badge/data%20collected-none-brightgreen)

</div>

---

## What it does

Nonstop keeps your music going while you work in other tabs. It dismisses the "Are you still there?" prompts, stops the page from thinking it is hidden, and on YouTube Music it fixes tracks that get stuck loading.

> It does not block ads, download anything, or change your account or Premium status.

Great for:

- Long listening sessions in a background tab
- Playlists and mixes you leave running all day
- YouTube Music tracks that freeze with a spinner at 0:00 after a track change
- Anyone tired of coming back to a paused player

## Features

- **Auto-confirms "Are you still there?"** on YouTube and YouTube Music, then resumes playback if the prompt paused it.
- **Background playback.** Makes the page treat the tab as visible, so playback is not interrupted for being hidden.
- **Activity signal.** Sends a small keep-alive every 5 minutes.
- **Stall recovery on YouTube Music.** Detects stuck tracks and fixes them in stages (see below).
- **Loop-safe.** Limited to 3 recovery attempts per 15 minutes per tab, and paused while the browser is offline, so it cannot get stuck in a reload loop.
- **Debug logging.** Every line is prefixed with `[YT-Nonstop-Debug]` in the browser console.

### Stall recovery

| Stalled for | Action |
|---|---|
| 15 s | **Nudge:** click Next, then Previous 2 s later to return to the same track. |
| 30 s | **Reload** the tab and press play again. |
| 15 s after a reload, same track | **Skip.** The track is treated as a bad entry. |

See [info.txt](info.txt) for the full behaviour and the fields in the stall snapshot.

## Install

[![Add to Firefox](https://img.shields.io/badge/Add%20to%20Firefox-FF7139?logo=firefox-browser&logoColor=white&style=for-the-badge)](https://addons.mozilla.org/en-US/firefox/addon/nonstop-for-youtube-music/)

To try it from source:

1. Open `about:debugging` and choose **This Firefox**.
2. Click **Load Temporary Add-on**.
3. Select `manifest.json`.

Reload the add-on and the tab after each edit. Requires Firefox 142 or newer.

## Usage

There is nothing to configure. Install it, open YouTube or YouTube Music, and start playing. Nonstop runs on its own in the background.

For the best results after a recovery reload, set Autoplay to **Allow Audio and Video** for `music.youtube.com` in Firefox's site permissions.

## Permissions

| Permission | Why |
|---|---|
| `https://www.youtube.com/*`, `https://music.youtube.com/*` | The only sites the extension runs on, so it can dismiss prompts and watch playback. |

It requests no extra permissions.

## Privacy

The extension collects no data and makes no network requests of its own. It runs only on `www.youtube.com` and `music.youtube.com`, and keeps a few small counters in the tab's session storage to limit recovery attempts.

## Known limits

- Nonstop relies on YouTube's page structure and may need an update if YouTube changes its player or dialogs.
- After a recovery reload, Firefox's autoplay policy can leave the page paused. See [Usage](#usage) for the fix.
- Enable **Persist Logs** in the console to keep log lines across the watchdog's reload.

## Development

There is no build step.

1. Check the extension

   ```bash
   npx web-ext lint
   ```

2. Launch in a temporary Firefox profile

   ```bash
   npx web-ext run
   ```

3. Create the zip

   ```bash
   npx web-ext build
   ```

### Testing

`test.js` is a console test for the popup handler. Paste it into the DevTools console on a `music.youtube.com` tab that was loaded after the extension. Test the stall watchdog by blocking a `videoplayback` request in the Network panel and skipping to the next track.

Issues and pull requests are welcome.

## License

[MIT](LICENSE)

---

<sub>Not affiliated with YouTube or Google.</sub>