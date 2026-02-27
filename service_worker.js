const CONTEXT_MENU_ID = "typewise-correct-spelling";
const MAX_TEXT_LENGTH = 2000;
const OPENAI_TIMEOUT_MS = 15000;

const DEFAULT_SETTINGS = {
  apiKey: "",
  language: "fr",
  enabled: true
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Corriger l'orthographe (IA)",
    contexts: ["editable", "selection"]
  });

  const existing = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({
    apiKey: existing.apiKey || "",
    language: existing.language || "fr",
    enabled: typeof existing.enabled === "boolean" ? existing.enabled : true
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, {
    type: "TW_TRIGGER_CORRECTION",
    source: "context_menu"
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "correct_spelling") {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, {
    type: "TW_TRIGGER_CORRECTION",
    source: "shortcut"
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TW_GET_CORRECTION") {
    return false;
  }

  correctSpelling(message.payload)
    .then((result) => sendResponse({ ok: true, correctedText: result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: normalizeError(error)
      });
    });

  return true;
});

async function correctSpelling(payload) {
  const { text, language } = payload || {};
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("EMPTY_TEXT");
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error("TEXT_TOO_LONG");
  }

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.enabled) {
    throw new Error("EXTENSION_DISABLED");
  }

  if (!settings.apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        input: [
          {
            role: "system",
            content:
              "Tu es un correcteur orthographique. Corrige uniquement l'orthographe, sans modifier le style, la grammaire (sauf si necessaire pour l'orthographe), ni reformuler. Rends uniquement le texte corrige, sans explications."
          },
          {
            role: "user",
            content: `Langue cible: ${language || "fr"}\nTexte:\n${text}`
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await safeJson(response);
      const apiMessage = body?.error?.message;
      throw new HttpError(response.status, apiMessage);
    }

    const data = await response.json();
    const correctedText = extractOutputText(data);
    if (!correctedText) {
      throw new Error("EMPTY_MODEL_RESPONSE");
    }

    return correctedText;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("TIMEOUT");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = data?.output || [];
  const texts = [];
  for (const item of chunks) {
    const parts = item?.content || [];
    for (const part of parts) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        texts.push(part.text);
      }
    }
  }

  return texts.join("\n").trim();
}

function normalizeError(error) {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return "Cle API invalide ou expirée (401).";
    }

    if (error.status === 429) {
      return "Quota atteint ou limite de requetes (429).";
    }

    if (error.status >= 500) {
      return "Service OpenAI indisponible temporairement (5xx).";
    }

    return `Erreur API (${error.status}).`;
  }

  switch (error.message) {
    case "EMPTY_TEXT":
      return "Aucun texte a corriger.";
    case "TEXT_TOO_LONG":
      return "Texte trop long (maximum 2000 caracteres).";
    case "MISSING_API_KEY":
      return "Ajoute une cle API OpenAI dans le popup de l'extension.";
    case "EXTENSION_DISABLED":
      return "L'extension est desactivee dans le popup.";
    case "TIMEOUT":
      return "La requete a expire (timeout). Reessaie.";
    case "EMPTY_MODEL_RESPONSE":
      return "Reponse IA vide. Reessaie.";
    default:
      return "Erreur technique. Verifie la connexion et reessaie.";
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message || `HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
  }
}
