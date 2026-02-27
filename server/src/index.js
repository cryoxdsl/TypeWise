import "dotenv/config";
import express from "express";
import cors from "cors";
import { authMiddleware, handleDevLogin, handleRefresh } from "./auth.js";
import {
  canUseMode,
  consumeQuota,
  ensureUser,
  getPlanFeatures,
  getQuotaRemaining,
  getUserProfile,
  meResponse
} from "./quotas.js";
import { correctWithOpenAI } from "./openaiProxy.js";
import { createPrivacyLogger } from "./logger.js";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE || 60);

const logger = createPrivacyLogger({
  privacyEnhancedDefault: String(process.env.PRIVACY_ENHANCED_DEFAULT || "false") === "true"
});

app.use(cors());
app.use(express.json({ limit: "64kb" }));

const rateMap = new Map();

app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const minute = Math.floor(Date.now() / 60000);
  const authHeader = req.headers.authorization || "";
  const userHint = authHeader.slice(-16) || "anon";
  const key = `${ip}:${userHint}:${minute}`;
  const current = rateMap.get(key) || 0;
  if (current >= RATE_LIMIT_PER_MINUTE) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }
  rateMap.set(key, current + 1);
  return next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "typewise-server", ts: new Date().toISOString() });
});

app.post("/auth/dev-login", handleDevLogin);
app.post("/auth/refresh", handleRefresh);

app.get("/me", authMiddleware, (req, res) => {
  ensureUser(req.user);
  return res.json(meResponse(req.user));
});

app.post("/correct", authMiddleware, async (req, res) => {
  const started = Date.now();
  const user = ensureUser(req.user);

  const mode = String(req.body?.mode || "");
  const language = String(req.body?.language || "fr");
  const text = String(req.body?.text || "");
  const hostname = req.body?.hostname ? String(req.body.hostname) : undefined;
  const privacyEnhanced = Boolean(req.body?.privacyEnhanced);

  if (!mode || !text) {
    return res.status(400).json({ error: "mode and text are required" });
  }

  if (text.length > 3000) {
    return res.status(400).json({ error: "text too long (3000 max)" });
  }

  if (!canUseMode(user.plan, mode)) {
    return res.status(402).json({ error: "mode not available for current plan" });
  }

  const consumed = consumeQuota(user.userId, user.plan);
  if (!consumed.ok) {
    return res.status(429).json({ error: "quota exceeded" });
  }

  try {
    const modelResponse = await correctWithOpenAI({ mode, language, text });

    const payload = {
      corrected_text: modelResponse.corrected_text,
      confidence_score: Number(modelResponse.confidence_score || 0.85),
      changes_explained: Array.isArray(modelResponse.changes_explained) ? modelResponse.changes_explained : [],
      quota_remaining: consumed.quotaRemaining
    };

    logger.metric("correct", {
      status: "ok",
      mode,
      latencyMs: Date.now() - started,
      textLength: text.length,
      plan: user.plan,
      orgId: user.orgId,
      quotaRemaining: consumed.quotaRemaining,
      hostname,
      privacyEnhanced
    });

    return res.json(payload);
  } catch (error) {
    logger.error("correct", {
      code: error.status ? `HTTP_${error.status}` : "ERR_PROXY",
      mode,
      plan: user.plan,
      orgId: user.orgId,
      hostname,
      privacyEnhanced
    });

    if (error.status === 408) {
      return res.status(408).json({ error: "openai timeout" });
    }

    if (error.status === 401) {
      return res.status(502).json({ error: "upstream unauthorized" });
    }

    return res.status(502).json({ error: "upstream correction failed" });
  }
});

app.post("/billing/webhook", (req, res) => {
  const eventType = req.body?.type || "unknown";
  logger.metric("billing_webhook", { status: "ok", mode: eventType });
  return res.json({ ok: true, received: eventType, note: "Stripe stub only" });
});

app.get("/sso/config", authMiddleware, (req, res) => {
  const user = getUserProfile(req.user.userId);
  if (!user || user.plan !== "ENTERPRISE") {
    return res.status(403).json({ error: "enterprise only" });
  }

  return res.json({
    enabled: true,
    provider: "stub-sso",
    orgId: user.orgId,
    note: "SSO integration stub"
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error", err?.message);
  res.status(500).json({ error: "internal server error" });
});

app.listen(PORT, () => {
  console.log(`TypeWise server listening on http://localhost:${PORT}`);
  console.log("No user text is logged. Metrics are privacy-safe aggregates.");
});
