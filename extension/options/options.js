const MODES = [
  ["MODE_ORTHO", "Orthographe"],
  ["MODE_GRAMMAR", "Grammaire"],
  ["MODE_REWRITE_LIGHT", "Reformulation legere"],
  ["MODE_REWRITE_PRO", "Reformulation pro"],
  ["MODE_CLARITY", "Clarte"],
  ["MODE_TONE", "Ton (premium)"]
];

const els = {
  email: document.getElementById("email"),
  orgId: document.getElementById("orgId"),
  workspaceId: document.getElementById("workspaceId"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  meBtn: document.getElementById("meBtn"),
  authStatus: document.getElementById("authStatus"),
  meJson: document.getElementById("meJson"),

  backendBaseUrl: document.getElementById("backendBaseUrl"),
  language: document.getElementById("language"),
  selectedMode: document.getElementById("selectedMode"),
  privacyEnhanced: document.getElementById("privacyEnhanced"),
  showFieldButton: document.getElementById("showFieldButton"),
  enabled: document.getElementById("enabled"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  resetConfigBtn: document.getElementById("resetConfigBtn"),
  configStatus: document.getElementById("configStatus"),

  exportHistoryBtn: document.getElementById("exportHistoryBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),
  historyStatus: document.getElementById("historyStatus"),
  historyJson: document.getElementById("historyJson")
};

init();

async function init() {
  for (const [value, label] of MODES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    els.selectedMode.appendChild(option);
  }

  await loadSettings();
  await refreshHistory();
  bindActions();
}

function bindActions() {
  els.loginBtn.addEventListener("click", devLogin);
  els.logoutBtn.addEventListener("click", logout);
  els.meBtn.addEventListener("click", loadMe);
  els.saveConfigBtn.addEventListener("click", saveSettings);
  els.resetConfigBtn.addEventListener("click", resetSettings);
  els.exportHistoryBtn.addEventListener("click", exportHistory);
  els.clearHistoryBtn.addEventListener("click", clearHistory);
  els.refreshHistoryBtn.addEventListener("click", refreshHistory);
}

async function devLogin() {
  const email = (els.email.value || "").trim();
  const orgId = (els.orgId.value || "org_demo").trim();
  const workspaceId = (els.workspaceId.value || "ws_default").trim();

  if (!email) {
    els.authStatus.textContent = "Email requis.";
    return;
  }

  try {
    const result = await window.TypeWiseApiClient.devLogin(email, orgId, workspaceId);
    await window.TypeWiseApiClient.saveAuth({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      tokenType: "Bearer",
      expiresAt: result.expiresAt,
      userEmail: email
    });
    els.authStatus.textContent = "Connecte.";
    await loadMe();
  } catch (error) {
    els.authStatus.textContent = `Echec login: ${error.message}`;
  }
}

async function logout() {
  await window.TypeWiseApiClient.clearAuth();
  els.authStatus.textContent = "Deconnecte.";
  els.meJson.textContent = "";
}

async function loadMe() {
  try {
    const me = await window.TypeWiseApiClient.getMe();
    els.meJson.textContent = JSON.stringify(me, null, 2);
    els.authStatus.textContent = "/me OK";
  } catch (error) {
    els.authStatus.textContent = `/me erreur: ${error.message}`;
    els.meJson.textContent = "";
  }
}

async function loadSettings() {
  const settings = await window.TypeWiseApiClient.getSettings();
  els.backendBaseUrl.value = settings.backendBaseUrl;
  els.language.value = settings.language;
  els.selectedMode.value = settings.selectedMode;
  els.privacyEnhanced.checked = !!settings.privacyEnhanced;
  els.showFieldButton.checked = !!settings.showFieldButton;
  els.enabled.checked = !!settings.enabled;
}

async function saveSettings() {
  const next = {
    backendBaseUrl: els.backendBaseUrl.value.trim() || "http://localhost:8787",
    language: els.language.value,
    selectedMode: els.selectedMode.value,
    privacyEnhanced: els.privacyEnhanced.checked,
    showFieldButton: els.showFieldButton.checked,
    enabled: els.enabled.checked
  };

  await window.TypeWiseApiClient.saveSettings(next);
  els.configStatus.textContent = "Configuration enregistree.";
}

async function resetSettings() {
  await window.TypeWiseApiClient.saveSettings({
    backendBaseUrl: "http://localhost:8787",
    language: "fr",
    selectedMode: "MODE_ORTHO",
    privacyEnhanced: false,
    showFieldButton: false,
    enabled: true
  });
  await loadSettings();
  els.configStatus.textContent = "Configuration reset.";
}

async function refreshHistory() {
  const state = await chrome.storage.local.get({ historyLocal: [] });
  const history = state.historyLocal || [];
  els.historyJson.textContent = JSON.stringify(history.slice(0, 20), null, 2);
  els.historyStatus.textContent = `${history.length} entree(s) locale(s)`;
}

async function clearHistory() {
  await chrome.storage.local.set({ historyLocal: [] });
  await refreshHistory();
  els.historyStatus.textContent = "Historique supprime.";
}

async function exportHistory() {
  const state = await chrome.storage.local.get({ historyLocal: [] });
  const content = JSON.stringify(state.historyLocal || [], null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `typewise-history-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  els.historyStatus.textContent = "Export JSON termine.";
}
