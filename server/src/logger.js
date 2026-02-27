import crypto from "crypto";

export function createPrivacyLogger({ privacyEnhancedDefault = false } = {}) {
  function hashOrgId(orgId) {
    if (!orgId) return "unknown";
    return crypto.createHash("sha256").update(String(orgId)).digest("hex").slice(0, 16);
  }

  function metric(eventName, payload = {}) {
    const safe = {
      event: eventName,
      ts: new Date().toISOString(),
      status: payload.status || "ok",
      latencyMs: payload.latencyMs || 0,
      mode: payload.mode || "-",
      textLength: payload.textLength || 0,
      plan: payload.plan || "-",
      orgHash: hashOrgId(payload.orgId),
      quotaRemaining: typeof payload.quotaRemaining === "number" ? payload.quotaRemaining : undefined
    };

    const enhanced = payload.privacyEnhanced ?? privacyEnhancedDefault;
    if (!enhanced && payload.hostname) {
      safe.hostname = payload.hostname;
    }

    console.log("[metric]", JSON.stringify(safe));
  }

  function error(eventName, payload = {}) {
    const safe = {
      event: eventName,
      ts: new Date().toISOString(),
      status: "error",
      code: payload.code || "ERR_INTERNAL",
      mode: payload.mode || "-",
      plan: payload.plan || "-",
      orgHash: hashOrgId(payload.orgId)
    };

    const enhanced = payload.privacyEnhanced ?? privacyEnhancedDefault;
    if (!enhanced && payload.hostname) {
      safe.hostname = payload.hostname;
    }

    console.error("[metric]", JSON.stringify(safe));
  }

  return { metric, error };
}
