import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ensureUser, inferPlanFromEmail } from "./quotas.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;

export function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TTL_SECONDS });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function handleDevLogin(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const orgId = String(req.body?.orgId || "org_demo").trim();
  const workspaceId = String(req.body?.workspaceId || "ws_default").trim();

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const userId = crypto.createHash("sha256").update(email).digest("hex").slice(0, 24);
  const plan = inferPlanFromEmail(email);

  const user = ensureUser({ userId, email, plan, orgId, workspaceId });
  const accessToken = signAccessToken({
    userId: user.userId,
    email: user.email,
    plan: user.plan,
    orgId: user.orgId,
    workspaceId: user.workspaceId
  });

  const refreshToken = signRefreshToken({
    userId: user.userId,
    type: "refresh"
  });

  return res.json({
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresAt: Date.now() + ACCESS_TTL_SECONDS * 1000,
    plan: user.plan
  });
}

export function handleRefresh(req, res) {
  const refreshToken = String(req.body?.refreshToken || "");
  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  try {
    const decoded = verifyToken(refreshToken);
    if (decoded.type !== "refresh") {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const accessToken = signAccessToken({ userId: decoded.userId });
    return res.json({
      accessToken,
      tokenType: "Bearer",
      expiresAt: Date.now() + ACCESS_TTL_SECONDS * 1000
    });
  } catch {
    return res.status(401).json({ error: "Refresh token expired or invalid" });
  }
}
