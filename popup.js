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

init();

async function init() {
  const values = await chrome.storage.sync.get(DEFAULTS);
  apiKeyInput.value = values.apiKey || "";
  languageSelect.value = values.language || "fr";
  enabledCheckbox.checked = typeof values.enabled === "boolean" ? values.enabled : true;
  const authMode = values.authMode || "api";
  modeApi.checked = authMode === "api";
  modeWeb.checked = authMode === "chatgpt_web";
}

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const language = languageSelect.value || "fr";
  const enabled = enabledCheckbox.checked;
  const authMode = modeWeb.checked ? "chatgpt_web" : "api";

  await chrome.storage.sync.set({ apiKey, language, enabled, authMode });

  statusEl.textContent = "Configuration enregistree.";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
});
