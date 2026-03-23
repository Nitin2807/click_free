const PROMPT_KEY = "gemini.promptPrefix";

const promptInput = document.getElementById("promptPrefix");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function loadSettings() {
  chrome.storage.local.get([PROMPT_KEY], (items) => {
    promptInput.value = items[PROMPT_KEY] || "";
  });
}

function saveSettings() {
  const prompt = promptInput.value.trim();

  chrome.storage.local.set({
    [PROMPT_KEY]: prompt
  }, () => {
    setStatus("Saved.");
  });
}

saveBtn.addEventListener("click", saveSettings);

loadSettings();