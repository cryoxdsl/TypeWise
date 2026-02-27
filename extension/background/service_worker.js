const CONTEXT_MENU_ID = "typewise-correct";
const DEFAULT_SETTINGS = {
  enabled: true,
  language: "fr",
  selectedMode: "MODE_ORTHO",
  backendBaseUrl: "http://localhost:8787",
  privacyEnhanced: false,
  showFieldButton: false
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Corriger avec IA",
    contexts: ["editable", "selection"]
  });

  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...settings });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
  sendTriggerMessage(tab.id, "context_menu");
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "correct_with_ai") return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  sendTriggerMessage(tab.id, "shortcut");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TW_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "TW_GET_SETTINGS") {
    chrome.storage.local.get(DEFAULT_SETTINGS).then((cfg) => sendResponse({ ok: true, settings: cfg }));
    return true;
  }

  if (message?.type === "TW_NOTIFY") {
    showNotification(message.title || "TypeWise", message.message || "Information");
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

function sendTriggerMessage(tabId, source) {
  chrome.tabs
    .sendMessage(tabId, { type: "TW_TRIGGER_CORRECTION", source })
    .catch((error) => {
      if (error?.message?.includes("Receiving end does not exist")) {
        showNotification("TypeWise AI", "Recharge l'onglet puis reessaie sur un champ editable.");
        return;
      }
      console.error("TypeWise sendMessage error:", error);
    });
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message
  });
}
