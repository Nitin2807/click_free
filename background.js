const GEMINI_STORAGE_KEY = "gemini.lastResponse";
const GEMINI_API_KEY_STORAGE = "gemini.apiKey";

// Gemini API endpoint (Google AI) - base URL
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1/models/";

async function setLastResponse(text) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [GEMINI_STORAGE_KEY]: text }, () => resolve());
  });
}

async function clearLastResponse() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([GEMINI_STORAGE_KEY], () => resolve());
  });
}

async function getLastResponse() {
  return new Promise((resolve) => {
    chrome.storage.local.get([GEMINI_STORAGE_KEY], (items) => {
      resolve(items[GEMINI_STORAGE_KEY] || null);
    });
  });
}

// Called when the user presses Ctrl+Alt+U+P
async function handleSendToGemini(tab) {
  // Ask the content script for the current selection.
  chrome.tabs.sendMessage(tab.id, { type: "capture-selection" }, async (response) => {
    if (chrome.runtime.lastError) {
      console.warn("Could not send message to content script:", chrome.runtime.lastError.message);
      return;
    }
    if (!response || !response.text) {
      console.warn("No selection detected.");
      return;
    }

    const stored = await new Promise((resolve) => {
      chrome.storage.local.get([GEMINI_API_KEY_STORAGE, "gemini.model", "gemini.promptPrefix"], (items) => {
        resolve(items);
      });
    });

    const apiKey = stored[GEMINI_API_KEY_STORAGE];
    const model = stored["gemini.model"] || "gemini-1.5-flash";
    const promptPrefix = stored["gemini.promptPrefix"] || "";

    if (!apiKey) {
      console.warn("Gemini API key is missing. Open the extension options to set it.");
      return;
    }

    try {
      const url = `${GEMINI_API_BASE_URL}${model}:generateContent?key=${apiKey}`;
      const gResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: promptPrefix + response.text
            }]
          }]
        })
      });

      if (!gResponse.ok) {
        const text = await gResponse.text();
        console.warn("Gemini API error", gResponse.status, text);
        return;
      }

      const json = await gResponse.json();
      // Gemini response format
      const output = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      await setLastResponse(output);
    } catch (e) {
      console.warn("Error while talking to Gemini API", e);
    }
  });
}

// Called when the user presses Ctrl+Alt+U+N
async function handlePasteGeminiResponse(tab) {
  const response = await getLastResponse();
  if (!response) {
    console.warn("No Gemini response available");
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "paste-response", text: response }, async () => {
    await clearLastResponse();
  });
}

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    const tab = tabs[0];

    if (command === "send-to-gemini") {
      handleSendToGemini(tab);
    } else if (command === "paste-gemini-response") {
      handlePasteGeminiResponse(tab);
    }
  });
});
