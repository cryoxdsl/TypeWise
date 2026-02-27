const DEFAULTS = {
  apiKey: "",
  language: "fr",
  enabled: true,
  authMode: "api"
};

const apiKeyInput = document.getElementById("apiKey");
const languageSelect = document.getElementById("language");
const enabledCheckbox = document.getElementById("enabled");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const modeApi = document.getElementById("modeApi");
const modeWeb = document.getElementById("modeWeb");
const webModeHelp = document.getElementById("webModeHelp");
const openChatGptBtn = document.getElementById("openChatGptBtn");

init();

async function init() {
  const values = await chrome.storage.sync.get(DEFAULTS);
  apiKeyInput.value = values.apiKey || "";
  languageSelect.value = values.language || "fr";
  enabledCheckbox.checked = typeof values.enabled === "boolean" ? values.enabled : true;
  const authMode = values.authMode || "api";
  modeApi.checked = authMode === "api";
  modeWeb.checked = authMode === "chatgpt_web";
  updateModeUI(authMode);
}

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const language = languageSelect.value || "fr";
  const enabled = enabledCheckbox.checked;
  const authMode = modeWeb.checked ? "chatgpt_web" : "api";

  await chrome.storage.sync.set({ apiKey, language, enabled, authMode });
  updateModeUI(authMode);

  statusEl.textContent = "Configuration enregistree.";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
});

modeApi.addEventListener("change", () => updateModeUI("api"));
modeWeb.addEventListener("change", () => updateModeUI("chatgpt_web"));

openChatGptBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "TW_OPEN_CHATGPT" });
});

function updateModeUI(authMode) {
  const isWebMode = authMode === "chatgpt_web";
  webModeHelp.classList.toggle("hidden", !isWebMode);
  apiKeyInput.disabled = isWebMode;
  apiKeyInput.placeholder = isWebMode ? "Non utilise en mode login ChatGPT" : "sk-...";
}
