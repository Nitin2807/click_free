# Gemini QuickPaste (Chrome Extension)

A small Chrome extension that captures your selected text, sends it to Gemini (via API), and allows you to paste the response using keyboard shortcuts.

## Keys (default)
- **Ctrl + Alt + U + P** : Send selection to Gemini
- **Ctrl + Alt + U + N** : Paste latest Gemini response into focused field

## Setup (Developer Mode)
1. Open `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right).
3. Click **Load unpacked** and select this folder (`d:\without_click`).
4. Open the extension options (click "Details" -> "Extension options") and paste your Gemini API key.
5. Optionally set the model name (default is `gemini-pro`).

## Notes
- The extension stores your API key in `chrome.storage.local`.
- After you paste the response, the stored response is cleared so the next shortcut uses a fresh call.
- If a site blocks paste, the extension tries a safe insertion method (direct value setting + dispatching input/change events).

## Troubleshooting
- If the shortcut does nothing, make sure the extension has access to the current page (check the extension icon and allow it on the site).
- If the response never arrives, open DevTools on the background service worker (via `chrome://extensions`) to inspect logs.
