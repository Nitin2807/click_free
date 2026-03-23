// This content script runs in all pages (where allowed) and responds to background messages.

console.log("Gemini QuickPaste content script loaded on", window.location.href);

function getSelectionText() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return "";
  return sel.toString();
}

function dispatchInputEvents(element) {
  element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function getNativeValueSetter(element) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, "value")?.set;
}

function replaceWithNativeSetter(element, text) {
  const setter = getNativeValueSetter(element);
  if (!setter) {
    return false;
  }

  setter.call(element, text);
  dispatchInputEvents(element);
  return true;
}

function replaceAtCursor(element, text) {
  if (typeof element.setRangeText !== "function") {
    return false;
  }

  const start = Number.isInteger(element.selectionStart) ? element.selectionStart : 0;
  const end = Number.isInteger(element.selectionEnd) ? element.selectionEnd : start;

  element.setRangeText(text, start, end, "end");
  dispatchInputEvents(element);
  return true;
}

function dispatchBeforeInput(element, text) {
  try {
    return element.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      data: text,
      inputType: "insertFromPaste"
    }));
  } catch {
    return true;
  }
}

function insertIntoInputLike(element, text) {
  if (!dispatchBeforeInput(element, text)) {
    return true;
  }

  if (replaceAtCursor(element, text)) {
    return true;
  }

  return replaceWithNativeSetter(element, text);
}

function simulateTyping(element, text) {
  if (!element) return;
  element.focus();

  // Monaco: paste into current selection/cursor in focused editor.
  if (window.monaco && window.monaco.editor) {
    const editors = window.monaco.editor.getEditors();
    if (editors.length > 0) {
      const focusedEditor = editors.find((ed) => typeof ed.hasTextFocus === "function" && ed.hasTextFocus());
      const editor = focusedEditor || editors[0];
      const selection = typeof editor.getSelection === "function" ? editor.getSelection() : null;

      if (selection && typeof editor.executeEdits === "function") {
        editor.executeEdits("gemini-quickpaste", [{
          range: selection,
          text,
          forceMoveMarkers: true
        }]);
        if (typeof editor.pushUndoStop === "function") {
          editor.pushUndoStop();
        }
      } else {
        editor.setValue(text);
      }

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

  // Input/textarea: prefer native setter and range APIs to satisfy strict listeners.
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    insertIntoInputLike(element, text);
    return;
  }

  // If it's a contenteditable, use edit commands first.
  if (element.isContentEditable) {
    if (!dispatchBeforeInput(element, text)) {
      return;
    }

    element.focus();
    document.execCommand("selectAll", false);
    const inserted = document.execCommand("insertText", false, text);
    if (!inserted) {
      element.textContent = text;
    }
    dispatchInputEvents(element);
    return;
  }

  // Fallback: simulate keystrokes for each character.
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
    return;
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