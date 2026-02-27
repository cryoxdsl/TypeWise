const MAX_TEXT_LENGTH = 2000;

let currentOverlay = null;
let pendingReplacement = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "TW_TRIGGER_CORRECTION") {
    triggerCorrection();
  }
});

async function triggerCorrection() {
  const settings = await chrome.storage.sync.get({ enabled: true, language: "fr", authMode: "api" });
  if (!settings.enabled) {
    showMessageOverlay("Extension desactivee. Active-la dans le popup.", "error");
    return;
  }

  const selection = extractCurrentSelection();
  if (!selection.ok) {
    showMessageOverlay(selection.error, "error");
    return;
  }

  if (selection.text.length > MAX_TEXT_LENGTH) {
    showMessageOverlay("Texte trop long (maximum 2000 caracteres).", "error", selection.rect);
    return;
  }

  if (!selection.text.trim()) {
    showMessageOverlay("Selectionne du texte non vide.", "error", selection.rect);
    return;
  }

  pendingReplacement = selection;
  if (settings.authMode === "chatgpt_web") {
    showManualLoginOverlay({
      text: selection.text,
      language: settings.language || "fr",
      rect: selection.rect
    });
    return;
  }

  showLoadingOverlay(selection.rect);

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "TW_GET_CORRECTION",
      payload: {
        text: selection.text,
        language: settings.language || "fr"
      }
    });
  } catch {
    showMessageOverlay("Impossible de contacter le service worker.", "error", selection.rect);
    return;
  }

  if (!response?.ok) {
    showMessageOverlay(response?.error || "Erreur inconnue.", "error", selection.rect);
    return;
  }

  showResultOverlay({ before: selection.text, after: response.correctedText, rect: selection.rect });
}

function extractCurrentSelection() {
  const active = document.activeElement;

  if (isTextInput(active)) {
    const start = active.selectionStart;
    const end = active.selectionEnd;

    if (start == null || end == null || start === end) {
      return { ok: false, error: "Selectionne du texte dans le champ actif." };
    }

    const text = active.value.slice(start, end);
    const rect = getInputSelectionRect(active);
    return {
      ok: true,
      kind: "input",
      element: active,
      text,
      start,
      end,
      rect
    };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { ok: false, error: "Selectionne du texte dans un champ editable." };
  }

  const range = selection.getRangeAt(0);
  const editable = getEditableContainer(range.commonAncestorContainer);
  if (!editable) {
    return { ok: false, error: "Le texte selectionne n'est pas editable." };
  }

  const text = selection.toString();
  return {
    ok: true,
    kind: "contenteditable",
    element: editable,
    text,
    range: range.cloneRange(),
    rect: getRangeRect(range, editable)
  };
}

function isTextInput(element) {
  if (!element) {
    return false;
  }

  if (element.tagName === "TEXTAREA") {
    return !element.disabled && !element.readOnly;
  }

  if (element.tagName !== "INPUT") {
    return false;
  }

  const allowed = ["text", "search", "email", "url", "tel", "password"];
  return allowed.includes((element.type || "text").toLowerCase()) && !element.disabled && !element.readOnly;
}

function getEditableContainer(node) {
  let current = node instanceof Element ? node : node?.parentElement;
  while (current) {
    if (current.isContentEditable) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function showLoadingOverlay(anchorRect) {
  renderOverlay({
    title: "Correction en cours...",
    body: "Envoi du texte a l'IA externe.",
    actions: [{ label: "Annuler", onClick: closeOverlay }],
    anchorRect
  });
}

function showMessageOverlay(message, kind = "info", anchorRect = null) {
  renderOverlay({
    title: kind === "error" ? "Erreur" : "Information",
    body: message,
    actions: [{ label: "Fermer", onClick: closeOverlay }],
    anchorRect,
    kind
  });
}

function showResultOverlay({ before, after, rect }) {
  const body = document.createElement("div");

  const disclaimer = document.createElement("p");
  disclaimer.className = "tw-overlay-disclaimer";
  disclaimer.textContent = "Le texte ci-dessous provient d'une correction IA externe.";

  const afterLabel = document.createElement("p");
  afterLabel.className = "tw-overlay-label";
  afterLabel.textContent = "Proposition corrigee";

  const afterBox = document.createElement("pre");
  afterBox.className = "tw-overlay-text";
  afterBox.textContent = after;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "tw-overlay-link";
  toggle.textContent = "Voir le texte original";

  const beforeBox = document.createElement("pre");
  beforeBox.className = "tw-overlay-text tw-hidden";
  beforeBox.textContent = before;

  toggle.addEventListener("click", () => {
    beforeBox.classList.toggle("tw-hidden");
    toggle.textContent = beforeBox.classList.contains("tw-hidden")
      ? "Voir le texte original"
      : "Masquer le texte original";
  });

  body.append(disclaimer, afterLabel, afterBox, toggle, beforeBox);

  renderOverlay({
    title: "Correction orthographique",
    body,
    actions: [
      {
        label: "Remplacer",
        primary: true,
        onClick: () => {
          applyReplacement(after);
          closeOverlay();
        }
      },
      {
        label: "Copier",
        onClick: async () => {
          const ok = await copyToClipboard(after);
          showMessageOverlay(ok ? "Texte copie." : "Impossible de copier.", ok ? "info" : "error", rect);
        }
      },
      { label: "Annuler", onClick: closeOverlay }
    ],
    anchorRect: rect
  });
}

function showManualLoginOverlay({ text, language, rect }) {
  const body = document.createElement("div");
  const info = document.createElement("p");
  info.className = "tw-overlay-disclaimer";
  info.textContent =
    "Mode sans API: connecte-toi a ChatGPT, colle le prompt, puis colle ici la reponse corrigee.";

  const promptLabel = document.createElement("p");
  promptLabel.className = "tw-overlay-label";
  promptLabel.textContent = "Prompt a envoyer";

  const prompt = buildManualPrompt(text, language);
  const promptBox = document.createElement("pre");
  promptBox.className = "tw-overlay-text";
  promptBox.textContent = prompt;

  const resultLabel = document.createElement("p");
  resultLabel.className = "tw-overlay-label";
  resultLabel.textContent = "Colle la correction retournee par ChatGPT";

  const resultInput = document.createElement("textarea");
  resultInput.className = "tw-overlay-input";
  resultInput.placeholder = "Texte corrige...";

  body.append(info, promptLabel, promptBox, resultLabel, resultInput);

  renderOverlay({
    title: "Correction via login ChatGPT",
    body,
    actions: [
      {
        label: "Copier le prompt",
        onClick: async () => {
          const ok = await copyToClipboard(prompt);
          showMessageOverlay(ok ? "Prompt copie." : "Impossible de copier.", ok ? "info" : "error", rect);
        }
      },
      {
        label: "Ouvrir ChatGPT",
        onClick: () => {
          chrome.runtime.sendMessage({ type: "TW_OPEN_CHATGPT" });
        }
      },
      {
        label: "Remplacer",
        primary: true,
        onClick: () => {
          const corrected = resultInput.value.trim();
          if (!corrected) {
            showMessageOverlay("Colle d'abord la correction.", "error", rect);
            return;
          }
          applyReplacement(corrected);
          closeOverlay();
        }
      },
      { label: "Annuler", onClick: closeOverlay }
    ],
    anchorRect: rect
  });
}

function buildManualPrompt(text, language) {
  return [
    "Tu es un correcteur orthographique.",
    "Corrige uniquement l'orthographe, sans modifier le style, la grammaire (sauf si necessaire pour l'orthographe), ni reformuler.",
    "Rends uniquement le texte corrige, sans explications.",
    `Langue cible: ${language || "fr"}`,
    "Texte:",
    text
  ].join("\n");
}

function renderOverlay({ title, body, actions, anchorRect, kind }) {
  closeOverlay();

  const wrapper = document.createElement("div");
  wrapper.className = "tw-overlay-wrapper";
  if (kind) {
    wrapper.dataset.kind = kind;
  }

  const titleEl = document.createElement("h3");
  titleEl.className = "tw-overlay-title";
  titleEl.textContent = title;

  const bodyEl = document.createElement("div");
  bodyEl.className = "tw-overlay-body";
  if (typeof body === "string") {
    bodyEl.textContent = body;
  } else {
    bodyEl.appendChild(body);
  }

  const actionsEl = document.createElement("div");
  actionsEl.className = "tw-overlay-actions";

  for (const action of actions || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.className = action.primary ? "tw-btn tw-btn-primary" : "tw-btn";
    btn.addEventListener("click", action.onClick);
    actionsEl.appendChild(btn);
  }

  wrapper.append(titleEl, bodyEl, actionsEl);
  document.documentElement.appendChild(wrapper);

  positionOverlay(wrapper, anchorRect);
  currentOverlay = wrapper;
}

function positionOverlay(overlay, anchorRect) {
  const margin = 8;
  const rect = anchorRect || getDefaultAnchorRect();

  overlay.style.left = `${Math.max(margin, window.scrollX + rect.left)}px`;
  overlay.style.top = `${Math.max(margin, window.scrollY + rect.bottom + margin)}px`;

  const overlayRect = overlay.getBoundingClientRect();
  const rightOverflow = overlayRect.right - window.innerWidth;
  const bottomOverflow = overlayRect.bottom - window.innerHeight;

  if (rightOverflow > 0) {
    overlay.style.left = `${Math.max(margin, window.scrollX + rect.left - rightOverflow - margin)}px`;
  }

  if (bottomOverflow > 0) {
    overlay.style.top = `${Math.max(margin, window.scrollY + rect.top - overlayRect.height - margin)}px`;
  }
}

function getDefaultAnchorRect() {
  const active = document.activeElement;
  if (active?.getBoundingClientRect) {
    return active.getBoundingClientRect();
  }

  return {
    top: 24,
    left: 24,
    bottom: 24,
    right: 24,
    width: 0,
    height: 0
  };
}

function getRangeRect(range, fallbackElement) {
  const rect = range.getBoundingClientRect();
  if (rect && (rect.width || rect.height)) {
    return rect;
  }

  return fallbackElement.getBoundingClientRect();
}

function getInputSelectionRect(element) {
  return element.getBoundingClientRect();
}

function applyReplacement(correctedText) {
  if (!pendingReplacement) {
    return;
  }

  if (pendingReplacement.kind === "input") {
    const { element, start, end } = pendingReplacement;
    element.focus();
    element.setSelectionRange(start, end);
    element.setRangeText(correctedText, start, end, "end");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    pendingReplacement = null;
    return;
  }

  if (pendingReplacement.kind === "contenteditable") {
    const { element, range } = pendingReplacement;
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(range);

    const activeRange = selection.getRangeAt(0);
    activeRange.deleteContents();

    const node = document.createTextNode(correctedText);
    activeRange.insertNode(node);

    const newRange = document.createRange();
    newRange.setStartAfter(node);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    pendingReplacement = null;
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function closeOverlay() {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
}
