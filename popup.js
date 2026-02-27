const DEFAULTS = {
  apiKey: "",
  language: "fr",
  enabled: true
};

const apiKeyInput = document.getElementById("apiKey");
const languageSelect = document.getElementById("language");
const enabledCheckbox = document.getElementById("enabled");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

init();

async function init() {
  const values = await chrome.storage.sync.get(DEFAULTS);
  apiKeyInput.value = values.apiKey || "";
  languageSelect.value = values.language || "fr";
  enabledCheckbox.checked = typeof values.enabled === "boolean" ? values.enabled : true;
}

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const language = languageSelect.value || "fr";
  const enabled = enabledCheckbox.checked;

  await chrome.storage.sync.set({ apiKey, language, enabled });

  statusEl.textContent = "Configuration enregistree.";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
});
