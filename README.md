# Nonstop for YouTube & YouTube Music

A Firefox extension that keeps YouTube and YouTube Music playing in a background tab, and recovers YouTube Music when a track stalls.

Not affiliated with YouTube or Google.

## What it does

- Auto-confirms the "Are you still there?" style prompts on YouTube and YouTube Music, then resumes playback if the prompt paused it.
- Makes the page treat the tab as visible, so background playback is not interrupted for being hidden.
- Sends a small activity signal every 5 minutes.
- On YouTube Music, recovers from stalled tracks (a spinner stuck at 0:00 after a track change).

It does not block ads, download anything, or change your account or Premium status.

## Stall recovery

| Stalled for | Action |
| --- | --- |
| 15 s | Nudge: click Next, then Previous 2 s later to return to the same track. |
| 30 s | Reload the tab and press play again. |
| 15 s after a reload, same track | Treat it as a bad entry and skip it. |

Recovery is limited to 3 attempts per 15 minutes per tab, and it pauses while the browser is offline, so it cannot get stuck in a reload loop. See [info.txt](info.txt) for the full behaviour and the fields in the stall snapshot.

## Install

<!-- Add the Firefox Add-ons link here once the listing is live. -->

To try it from source, open `about:debugging`, choose **This Firefox**, click **Load Temporary Add-on**, and select `manifest.json`. Reload the add-on and the tab after each edit.

Requires Firefox 142 or newer.

## Troubleshooting

- After a recovery reload, Firefox's autoplay policy can leave the page paused. Set Autoplay to "Allow Audio and Video" for `music.youtube.com` in the site permissions.
- The extension relies on YouTube's page structure and may need an update if YouTube changes its player or dialogs.
- Log lines are prefixed with `[YT-Nonstop-Debug]` in the browser console. Enable "Persist Logs" to keep them across the watchdog's reload.

## Privacy

The extension collects no data and makes no network requests of its own. It runs only on `www.youtube.com` and `music.youtube.com`, and keeps a few small counters in the tab's session storage to limit recovery attempts. It requests no extra permissions.

## Testing

`test.js` is a console test for the popup handler. Paste it into the DevTools console on a `music.youtube.com` tab that was loaded after the extension. The stall watchdog is tested by blocking a `videoplayback` request in the Network panel and skipping to the next track.

## Development

There is no build step. Only zipping.

```
npx web-ext lint
npx web-ext run
npx web-ext build
```

## License

[MIT](LICENSE)
