const PLAN_LIMITS = {
  FREE: Number(process.env.FREE_DAILY_LIMIT || 20),
  PREMIUM: Number(process.env.PREMIUM_DAILY_LIMIT || 500),
  ENTERPRISE: Number.POSITIVE_INFINITY
};

const PLAN_FEATURES = {
  FREE: {
    modes: ["MODE_ORTHO", "MODE_GRAMMAR", "MODE_REWRITE_LIGHT"],
    tone: false,
    localHistoryOnly: true
  },
  PREMIUM: {
    modes: ["MODE_ORTHO", "MODE_GRAMMAR", "MODE_REWRITE_LIGHT", "MODE_REWRITE_PRO", "MODE_CLARITY", "MODE_TONE"],
    tone: true,
    localHistoryOnly: false
  },
  ENTERPRISE: {
    modes: ["MODE_ORTHO", "MODE_GRAMMAR", "MODE_REWRITE_LIGHT", "MODE_REWRITE_PRO", "MODE_CLARITY", "MODE_TONE"],
    tone: true,
    localHistoryOnly: false,
    sso: true,
    policyControls: true
  }
};

const usageByUserDay = new Map();
const users = new Map();

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function ensureUser(user) {
  if (!users.has(user.userId)) {
    users.set(user.userId, {
      userId: user.userId,
      email: user.email,
      plan: user.plan || inferPlanFromEmail(user.email),
      orgId: user.orgId || "org_demo",
      workspaceId: user.workspaceId || "ws_default"
    });
  }
  return users.get(user.userId);
}

export function inferPlanFromEmail(email = "") {
  const lower = email.toLowerCase();
  if (lower.includes("enterprise")) return "ENTERPRISE";
  if (lower.includes("premium") || lower.endsWith("@pro.test")) return "PREMIUM";
  return "FREE";
}

export function getUserProfile(userId) {
  return users.get(userId) || null;
}

export function getPlanFeatures(plan) {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.FREE;
}

export function getQuotaRemaining(userId, plan) {
  const key = `${userId}:${dayKey()}`;
  const used = usageByUserDay.get(key) || 0;
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
  if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
  return Math.max(0, limit - used);
}

export function canUseMode(plan, mode) {
  const features = getPlanFeatures(plan);
  return features.modes.includes(mode);
}

export function consumeQuota(userId, plan) {
  const remaining = getQuotaRemaining(userId, plan);
  if (remaining <= 0) {
    return { ok: false, quotaRemaining: 0 };
  }

  const key = `${userId}:${dayKey()}`;
  const used = usageByUserDay.get(key) || 0;
  usageByUserDay.set(key, used + 1);

  return {
    ok: true,
    quotaRemaining: getQuotaRemaining(userId, plan)
  };
}

export function meResponse(user) {
  const profile = getUserProfile(user.userId) || ensureUser(user);
  const quotaRemaining = getQuotaRemaining(profile.userId, profile.plan);
  return {
    userId: profile.userId,
    email: profile.email,
    plan: profile.plan,
    orgId: profile.orgId,
    workspaceId: profile.workspaceId,
    quotaRemaining: Number.isFinite(quotaRemaining) ? quotaRemaining : null,
    features: getPlanFeatures(profile.plan)
  };
}
