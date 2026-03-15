const STORAGE_KEY = "gemini.apiKey";
const MODEL_KEY = "gemini.model";
const PROMPT_KEY = "gemini.promptPrefix";

const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const promptInput = document.getElementById("promptPrefix");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function loadSettings() {
  chrome.storage.local.get([STORAGE_KEY, MODEL_KEY, PROMPT_KEY], (items) => {
    apiKeyInput.value = items[STORAGE_KEY] || "";
    modelInput.value = items[MODEL_KEY] || "gemini-1.5-flash";
    promptInput.value = items[PROMPT_KEY] || "";
  });
}

function saveSettings() {
  const key = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  const prompt = promptInput.value.trim();

  if (!key) {
    setStatus("API key cannot be empty.", true);
    return;
  }

  chrome.storage.local.set({
    [STORAGE_KEY]: key,
    [MODEL_KEY]: model,
    [PROMPT_KEY]: prompt
  }, () => {
    setStatus("Saved.");
  });
}

saveBtn.addEventListener("click", saveSettings);

loadSettings();
