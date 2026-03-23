console.warn("Gemini QuickPaste worker loaded", new Date().toISOString());

function logRegisteredCommands(contextLabel) {
  chrome.commands.getAll((commands) => {
    if (chrome.runtime.lastError) {
      console.warn(`[${contextLabel}] Could not read commands:`, chrome.runtime.lastError.message);
      return;
    }
    console.warn(`[${contextLabel}] Registered commands:`, commands.map((c) => ({ name: c.name, shortcut: c.shortcut })));
  });
}

chrome.runtime.onInstalled.addListener(() => {
  logRegisteredCommands("onInstalled");
});

chrome.runtime.onStartup.addListener(() => {
  logRegisteredCommands("onStartup");
});

logRegisteredCommands("workerLoad");
const GEMINI_STORAGE_KEY = "gemini.lastResponse";
const LAST_ERROR_KEY = "gemini.lastError";
const HARDCODED_GEMINI_API_KEY = "AIzaSyD8sO76AnpuAk7d-a_cQdFADAMnVkspPb4";
const HARDCODED_MODEL_ID = "gemma-3-27b-it";

// Gemini API endpoint (Google AI) - base URL
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

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

async function setLastError(message) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LAST_ERROR_KEY]: message }, () => resolve());
  });
}

async function getLastError() {
  return new Promise((resolve) => {
    chrome.storage.local.get([LAST_ERROR_KEY], (items) => {
      resolve(items[LAST_ERROR_KEY] || null);
    });
  });
}

async function clearLastError() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([LAST_ERROR_KEY], () => resolve());
  });
}

function canInjectIntoUrl(url) {
  return typeof url === "string" && /^(https?|file):/i.test(url);
}

function sendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        files: ["content.js"]
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      }
    );
  });
}

async function sendMessageWithInjectionFallback(tab, message) {
  try {
    return await sendMessage(tab.id, message);
  } catch (error) {
    const messageText = error?.message || "";
    if (!messageText.includes("Receiving end does not exist")) {
      throw error;
    }

    if (!canInjectIntoUrl(tab.url)) {
      throw new Error(`Cannot inject content script on this page: ${tab.url || "unknown"}`);
    }

    await injectContentScript(tab.id);
    return sendMessage(tab.id, message);
  }
}

async function captureSelectionFromAllFrames(tab) {
  if (!canInjectIntoUrl(tab.url)) {
    throw new Error(`Cannot read selection on this page: ${tab.url || "unknown"}`);
  }

  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id, allFrames: true },
        func: () => {
          const active = document.activeElement;
          if (active && (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) {
            const start = active.selectionStart;
            const end = active.selectionEnd;
            if (Number.isInteger(start) && Number.isInteger(end) && end > start) {
              return active.value.slice(start, end);
            }
          }

          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) {
            return sel.toString();
          }

          return "";
        }
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        const texts = (results || [])
          .map((entry) => (typeof entry.result === "string" ? entry.result.trim() : ""))
          .filter(Boolean)
          .sort((a, b) => b.length - a.length);

        resolve(texts[0] || "");
      }
    );
  });
}

function extractFirstFencedBlock(text) {
  const match = text.match(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/);
  return match ? match[1] : text;
}

function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;

  return lines.slice(start, end);
}

function dedentCommonIndent(text) {
  const lines = trimBlankEdges(text.split("\n"));
  if (lines.length === 0) return "";

  let minIndent = null;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const indent = (line.match(/^ */) || [""])[0].length;
    minIndent = minIndent === null ? indent : Math.min(minIndent, indent);
  }

  if (!minIndent) {
    return lines.join("\n");
  }

  return lines
    .map((line) => (line.trim() === "" ? "" : line.slice(minIndent)))
    .join("\n");
}

function normalizeGeminiText(rawText) {
  if (!rawText) return "";

  const unixText = rawText.replace(/\r\n?/g, "\n");
  const withoutFence = extractFirstFencedBlock(unixText);
  const normalizedTabs = withoutFence.replace(/\t/g, "    ");
  const trimmedTrailSpaces = normalizedTabs.replace(/[ \t]+\n/g, "\n").trimEnd();

  return dedentCommonIndent(trimmedTrailSpaces);
}

function extractOutputText(json) {
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function summarizeApiError(status, text) {
  const oneLine = (text || "").replace(/\s+/g, " ").trim();
  return `Gemini API error ${status}: ${oneLine.slice(0, 240)}`;
}

// Called when the user presses Alt+Shift+U.
async function handleSendToGemini(tab) {
  await clearLastError();

  let selectionText = "";
  try {
    selectionText = await captureSelectionFromAllFrames(tab);
  } catch (e) {
    const msg = `Could not capture selection: ${e.message || e}`;
    await setLastError(msg);
    console.warn(msg);
    return;
  }

  if (!selectionText) {
    const msg = "No selection detected. Select text first, then press Alt+Shift+U.";
    await setLastError(msg);
    console.warn(msg);
    return;
  }

  const stored = await new Promise((resolve) => {
    chrome.storage.local.get(["gemini.promptPrefix"], (items) => {
      resolve(items);
    });
  });

  const apiKey = HARDCODED_GEMINI_API_KEY;
  const model = HARDCODED_MODEL_ID;
  const promptPrefix = stored["gemini.promptPrefix"] || "";

  try {
    const url = `${GEMINI_API_BASE_URL}${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const gResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: promptPrefix + selectionText
          }]
        }]
      })
    });

    if (!gResponse.ok) {
      const text = await gResponse.text();
      const msg = summarizeApiError(gResponse.status, text);
      await setLastError(msg);
      console.warn(`Gemini API error for model '${model}'`, gResponse.status, text);
      return;
    }

    const json = await gResponse.json();
    const output = extractOutputText(json);
    if (!output || !output.trim()) {
      const finishReason = json?.candidates?.[0]?.finishReason || "UNKNOWN";
      const msg = `Model returned empty output (finishReason=${finishReason}).`;
      await setLastError(msg);
      console.warn(msg, json);
      return;
    }

    const cleanedOutput = normalizeGeminiText(output);
    await setLastResponse(cleanedOutput || output);
    await clearLastError();
  } catch (e) {
    const msg = `Error while talking to Gemini API: ${e.message || e}`;
    await setLastError(msg);
    console.warn("Error while talking to Gemini API", e);
  }
}

// Called when the user presses Alt+Shift+Y.
async function handlePasteGeminiResponse(tab) {
  const response = await getLastResponse();
  if (!response) {
    const lastError = await getLastError();
    console.warn("No Gemini response available.", lastError ? `Last send error: ${lastError}` : "No previous send error recorded.");
    return;
  }

  try {
    await sendMessageWithInjectionFallback(tab, { type: "paste-response", text: response });
    await clearLastResponse();
  } catch (e) {
    await setLastError(`Could not paste into page: ${e.message || e}`);
    console.warn("Could not paste into page:", e.message || e);
  }
}

chrome.commands.onCommand.addListener((command) => {
  console.warn("Command received:", command);
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