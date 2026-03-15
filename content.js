// This content script runs in all pages (where allowed) and responds to background messages.

console.log("Gemini QuickPaste content script loaded on", window.location.href);

function getSelectionText() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return "";
  return sel.toString();
}

function dispatchInputEvents(element) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function simulateTyping(element, text) {
  element.focus();

  // Special handling for Monaco Editor (common in coding platforms like LeetCode, maang.in)
  if (window.monaco && window.monaco.editor) {
    const editors = window.monaco.editor.getEditors();
    if (editors.length > 0) {
      const editor = editors[0]; // Assume the first editor
      editor.setValue(text);
      editor.focus();
      console.log("Injected into Monaco editor");
      return;
    }
  }

  // Special handling for CodeMirror (another common editor)
  if (window.CodeMirror) {
    const cm = element.CodeMirror || element.closest('.CodeMirror')?.CodeMirror;
    if (cm) {
      cm.setValue(text);
      cm.focus();
      console.log("Injected into CodeMirror");
      return;
    }
  }

  // First, try direct value assignment + events (fastest)
  if ("value" in element) {
    element.value = text;
    dispatchInputEvents(element);
    return;
  }

  // If it's a contenteditable, use innerText
  if (element.isContentEditable) {
    element.innerText = text;
    dispatchInputEvents(element);
    return;
  }

  // Fallback: simulate keystrokes for each character
  // This can bypass some restrictions if the editor listens to key events
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const keydown = new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true });
    const keypress = new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true });
    const input = new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' });
    const keyup = new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true });

    element.dispatchEvent(keydown);
    if (!keydown.defaultPrevented) {
      element.dispatchEvent(keypress);
      if (!keypress.defaultPrevented) {
        element.dispatchEvent(input);
        // Update value manually if not handled
        if ("value" in element) {
          element.value += char;
        } else if (element.isContentEditable) {
          element.innerText += char;
        }
      }
    }
    element.dispatchEvent(keyup);
  }

  dispatchInputEvents(element);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message.type);
  if (message.type === "capture-selection") {
    const text = getSelectionText();
    console.log("Captured selection:", text);
    sendResponse({ text });
    return; // keepAlive not needed because sendResponse is called synchronously
  }

  if (message.type === "paste-response") {
    const active = document.activeElement;
    if (!active) {
      console.log("No active element to paste into");
      sendResponse({ success: false });
      return;
    }

    simulateTyping(active, message.text);
    console.log("Pasted response into", active.tagName);
    sendResponse({ success: true });
  }
});
