(function initApiClient(globalObj) {
  const DEFAULT_SETTINGS = {
    enabled: true,
    language: "fr",
    selectedMode: "MODE_ORTHO",
    backendBaseUrl: "http://localhost:8787",
    privacyEnhanced: false,
    showFieldButton: false
  };

  const DEFAULT_AUTH = {
    accessToken: "",
    refreshToken: "",
    tokenType: "Bearer",
    expiresAt: 0,
    userEmail: ""
  };

  const API_TIMEOUT_MS = 20000;

  async function getSettings() {
    return chrome.storage.local.get(DEFAULT_SETTINGS);
  }

  async function saveSettings(next) {
    const current = await getSettings();
    const merged = { ...current, ...next };
    await chrome.storage.local.set(merged);
    return merged;
  }

  async function getAuth() {
    return chrome.storage.local.get(DEFAULT_AUTH);
  }

  async function saveAuth(auth) {
    const merged = { ...DEFAULT_AUTH, ...auth };
    await chrome.storage.local.set(merged);
    return merged;
  }

  async function clearAuth() {
    await chrome.storage.local.set({ ...DEFAULT_AUTH });
  }

  async function request(path, options = {}) {
    const settings = await getSettings();
    const auth = await getAuth();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
      };

      if (auth.accessToken) {
        headers.Authorization = `${auth.tokenType || "Bearer"} ${auth.accessToken}`;
      }

      const response = await fetch(`${settings.backendBaseUrl}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      const data = await safeJson(response);
      if (!response.ok) {
        const msg = data?.error || `HTTP ${response.status}`;
        const error = new Error(msg);
        error.status = response.status;
        error.payload = data;
        throw error;
      }

      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error("Timeout serveur (20s)");
        timeoutError.status = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function safeJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function devLogin(email, orgId = "org_demo", workspaceId = "ws_default") {
    return request("/auth/dev-login", {
      method: "POST",
      body: { email, orgId, workspaceId }
    });
  }

  async function getMe() {
    return request("/me");
  }

  async function correct(payload) {
    return request("/correct", {
      method: "POST",
      body: payload
    });
  }

  globalObj.TypeWiseApiClient = {
    getSettings,
    saveSettings,
    getAuth,
    saveAuth,
    clearAuth,
    devLogin,
    getMe,
    correct
  };
})(window);
