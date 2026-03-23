# Gemini QuickPaste (Chrome Extension)

A small Chrome extension that captures your selected text, sends it to Gemini (via API), and allows you to paste the response using keyboard shortcuts.

## Keys (default)
- **Alt + Shift + U** : Send selection to Gemini
- **Alt + Shift + Y** : Paste latest Gemini response into focused field

## Setup (Developer Mode)
1. Open `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right).
3. Click **Load unpacked** and select this folder (`d:\click_free`).
4. Open the extension options (click "Details" -> "Extension options") if you want to set prompt prefix.

## Notes
- Gemini API key is embedded in `background.js`.
- Model is hardcoded to `gemma-3-27b-it`.
- The extension stores prompt prefix in `chrome.storage.local`.
- After you paste the response, the stored response is cleared so the next shortcut uses a fresh call.
- If a site blocks paste, the extension tries framework-aware insertion methods (`beforeinput`, native value setters, and editor adapters).

## Troubleshooting
- If the shortcut does nothing, make sure the extension has access to the current page (check the extension icon and allow it on the site).
- If the response never arrives, open DevTools on the background service worker (via `chrome://extensions`) to inspect logs.