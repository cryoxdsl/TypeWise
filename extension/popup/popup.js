const MODES = [
  ["MODE_ORTHO", "Orthographe"],
  ["MODE_GRAMMAR", "Grammaire"],
  ["MODE_REWRITE_LIGHT", "Reformulation legere"],
  ["MODE_REWRITE_PRO", "Reformulation pro"],
  ["MODE_CLARITY", "Clarte"],
  ["MODE_TONE", "Ton (premium)"]
];

const enabledEl = document.getElementById("enabled");
const modeEl = document.getElementById("mode");
const planEl = document.getElementById("plan");
const quotaEl = document.getElementById("quota");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const openOptionsBtn = document.getElementById("openOptionsBtn");

init();

async function init() {
  for (const [value, label] of MODES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeEl.appendChild(option);
  }

  const settings = await window.TypeWiseApiClient.getSettings();
  enabledEl.checked = !!settings.enabled;
  modeEl.value = settings.selectedMode;

  enabledEl.addEventListener("change", async () => {
    await window.TypeWiseApiClient.saveSettings({ enabled: enabledEl.checked });
  });

  modeEl.addEventListener("change", async () => {
    await window.TypeWiseApiClient.saveSettings({ selectedMode: modeEl.value });
  });

  refreshBtn.addEventListener("click", refreshMe);
  openOptionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

  await refreshMe();
}

async function refreshMe() {
  statusEl.textContent = "Chargement...";
  try {
    const me = await window.TypeWiseApiClient.getMe();
    planEl.textContent = me.plan || "-";
    quotaEl.textContent = typeof me.quotaRemaining === "number" ? String(me.quotaRemaining) : "-";
    statusEl.textContent = "Compte connecte";
  } catch (error) {
    planEl.textContent = "-";
    quotaEl.textContent = "-";
    statusEl.textContent = error?.status === 401 ? "Non connecte (ouvre Options)" : "Serveur indisponible";
  }
}
