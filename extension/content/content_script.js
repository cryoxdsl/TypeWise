(function initContentScript() {
  const MAX_TEXT_LENGTH = 3000;
  const MODES = [
    { value: "MODE_ORTHO", label: "Orthographe" },
    { value: "MODE_GRAMMAR", label: "Grammaire" },
    { value: "MODE_REWRITE_LIGHT", label: "Reformulation legere" },
    { value: "MODE_REWRITE_PRO", label: "Reformulation pro" },
    { value: "MODE_CLARITY", label: "Clarte" },
    { value: "MODE_TONE", label: "Ton (premium)" }
  ];

  const overlay = new window.TypeWiseOverlay();
  let lastSelection = null;
  let lastResult = null;

  overlay.onAction = async (action, payload) => {
    if (action === "cancel") {
      overlay.close();
      return;
    }

    if (action === "copy") {
      await copyText(payload.text || "");
      return;
    }

    if (action === "replace") {
      applyReplacement(payload.text || "");
      overlay.close();
      return;
    }

    if (action === "modeChanged") {
      await window.TypeWiseApiClient.saveSettings({ selectedMode: payload.mode });
      return;
    }

    if (action === "run") {
      await runCorrection(payload.mode);
    }
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TW_TRIGGER_CORRECTION") {
      startFlow();
    }
  });

  async function startFlow() {
    const settings = await window.TypeWiseApiClient.getSettings();
    if (!settings.enabled) {
      notifyInline("Extension desactivee dans le popup.");
      return;
    }

    const selected = extractSelection();
    if (!selected.ok) {
      notifyInline(selected.error);
      return;
    }

    if (selected.text.length > MAX_TEXT_LENGTH) {
      notifyInline("Selection trop longue (3000 caracteres max).");
      return;
    }

    lastSelection = selected;
    lastResult = null;

    const model = baseModel({
      selectedMode: settings.selectedMode,
      statusText: "Pret a corriger",
      quotaText: "Quota: -"
    });

    overlay.open(selected.rect, model);
    await runCorrection(settings.selectedMode);
  }

  async function runCorrection(modeOverride) {
    if (!lastSelection) return;

    const settings = await window.TypeWiseApiClient.getSettings();
    const mode = modeOverride || settings.selectedMode;
    await window.TypeWiseApiClient.saveSettings({ selectedMode: mode });

    overlay.open(lastSelection.rect, baseModel({
      selectedMode: mode,
      statusText: "Correction en cours...",
      correctedText: ""
    }));

    try {
      const payload = {
        mode,
        language: settings.language,
        text: lastSelection.text
      };

      if (!settings.privacyEnhanced) {
        payload.hostname = window.location.hostname;
      }

      const result = await window.TypeWiseApiClient.correct(payload);
      lastResult = result;

      addHistory({
        mode,
        before: lastSelection.text,
        after: result.corrected_text,
        confidence: result.confidence_score,
        date: new Date().toISOString()
      });

      const spans = window.TypeWiseDiff.computeDiffSpans(lastSelection.text, result.corrected_text);
      overlay.open(lastSelection.rect, baseModel({
        selectedMode: mode,
        correctedText: result.corrected_text,
        statusText: renderChangesSummary(result.changes_explained),
        confidenceText: `Confiance: ${Math.round((result.confidence_score || 0) * 100)}%`,
        quotaText: `Quota restant: ${result.quota_remaining ?? "-"}`,
        diffSpans: spans
      }));
    } catch (error) {
      const status = error?.status;
      const message = humanizeError(status, error?.message);
      overlay.open(lastSelection.rect, baseModel({
        selectedMode: mode,
        statusText: message,
        correctedText: ""
      }));

      if (status === 401) {
        chrome.runtime.sendMessage({ type: "TW_NOTIFY", title: "TypeWise", message: "Connecte-toi dans Options." });
      }
    }
  }

  function baseModel(extra) {
    return {
      modeOptions: MODES,
      selectedMode: "MODE_ORTHO",
      statusText: "",
      confidenceText: "Confiance: -",
      quotaText: "Quota: -",
      correctedText: "",
      diffSpans: [],
      ...extra
    };
  }

  function humanizeError(status, message) {
    if (status === 401) return "Session invalide. Ouvre les Options pour te connecter.";
    if (status === 402 || status === 429) return "Quota depasse. Passe en premium ou reessaie demain.";
    if (status >= 500) return "Serveur indisponible. Reessaie dans quelques secondes.";
    if (status === 408) return "Timeout du serveur.";
    return message || "Erreur inconnue.";
  }

  function renderChangesSummary(changes) {
    if (!Array.isArray(changes) || changes.length === 0) return "Aucun changement majeur.";
    return `${changes.length} changement(s) detecte(s).`;
  }

  function extractSelection() {
    const active = document.activeElement;

    if (isInputLike(active)) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (start == null || end == null || start === end) return { ok: false, error: "Selectionne un texte." };
      return {
        ok: true,
        kind: "input",
        element: active,
        text: active.value.slice(start, end),
        start,
        end,
        rect: active.getBoundingClientRect()
      };
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return { ok: false, error: "Selectionne un texte dans un champ editable." };
    }

    const range = sel.getRangeAt(0);
    const editable = getEditable(range.commonAncestorContainer);
    if (!editable) return { ok: false, error: "Le texte selectionne n'est pas editable." };

    return {
      ok: true,
      kind: "contenteditable",
      element: editable,
      text: sel.toString(),
      range: range.cloneRange(),
      rect: range.getBoundingClientRect()
    };
  }

  function isInputLike(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return !el.disabled && !el.readOnly;
    if (el.tagName !== "INPUT") return false;
    const allowed = ["text", "search", "email", "url", "tel", "password"];
    return allowed.includes((el.type || "text").toLowerCase()) && !el.disabled && !el.readOnly;
  }

  function getEditable(node) {
    let cur = node instanceof Element ? node : node?.parentElement;
    while (cur) {
      if (cur.isContentEditable) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function applyReplacement(nextText) {
    if (!lastSelection || !nextText) return;

    if (lastSelection.kind === "input") {
      const { element, start, end } = lastSelection;
      element.focus();
      element.setSelectionRange(start, end);
      element.setRangeText(nextText, start, end, "end");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (lastSelection.kind === "contenteditable") {
      const selection = window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(lastSelection.range);
      const r = selection.getRangeAt(0);
      r.deleteContents();
      const textNode = document.createTextNode(nextText);
      r.insertNode(textNode);
      const nr = document.createRange();
      nr.setStartAfter(textNode);
      nr.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nr);
      lastSelection.element.dispatchEvent(new Event("input", { bubbles: true }));
      lastSelection.element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  async function addHistory(item) {
    const state = await chrome.storage.local.get({ historyLocal: [] });
    const next = [item, ...(state.historyLocal || [])].slice(0, 100);
    await chrome.storage.local.set({ historyLocal: next });
  }

  function notifyInline(message) {
    chrome.runtime.sendMessage({ type: "TW_NOTIFY", title: "TypeWise", message });
  }
})();
