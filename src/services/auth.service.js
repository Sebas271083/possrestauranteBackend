import jwt from "jsonwebtoken";
import crypto from "crypto";
import { RefreshToken, User } from "../models/index.js";

// TTLS en segundos
const ACCESS_TTL = Number(process.env.JWT_ACCESS_TTL || 900);
const REFRESH_TTL = Number(process.env.JWT_REFRESH_TTL || 2592000); // 30 días

export function signAccess(user) {
  const payload = { sub: user.id, role: user.role, name: user.full_name };
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
    issuer: process.env.APP_ISSUER || "posresto"
  });
}

// ---- helpers RT ----
function genRt() {
  return crypto.randomBytes(32).toString("hex"); // token plano (se devuelve al cliente)
}
function hashRt(rt) {
  const pepper = process.env.RT_HASH_SECRET || ""; // opcional pero recomendado
  return crypto.createHash("sha256").update(rt + pepper).digest("hex");
}

export async function issueRefreshToken(user, { ip, user_agent } = {}) {
  const token = genRt();                 // token plano
  const token_hash = hashRt(token);      // lo que guardamos
  const expires_at = new Date(Date.now() + REFRESH_TTL * 1000);

  await RefreshToken.create({
    user_id: user.id,
    token_hash,
    user_agent: user_agent || null,
    ip: ip || null,
    expires_at
  });

  return token; // 👈 devolvemos el PLANO al cliente
}

export async function verifyRefreshExists(refresh_token) {
  const token_hash = hashRt(refresh_token);
  const row = await RefreshToken.findOne({ where: { token_hash, revoked_at: null } });
  if (!row) throw new Error("refresh_not_found");
  if (row.expires_at < new Date()) throw new Error("refresh_expired");
  return row;
}

export async function rotateRefreshToken(old_refresh, ctx = {}) {
  const row = await verifyRefreshExists(old_refresh);
  await row.update({ revoked_at: new Date() });

  const user = await User.findByPk(row.user_id);
  if (!user) throw new Error("refresh_user_missing");

  const refreshToken = await issueRefreshToken(user, ctx);
  const accessToken = signAccess(user);
  return { user, refreshToken, accessToken };
}

export async function revokeRefreshToken(refresh_token) {
  const token_hash = hashRt(refresh_token);
  const row = await RefreshToken.findOne({ where: { token_hash } });
  if (row) await row.update({ revoked_at: new Date() });
}

export async function verifyRefreshExistsOr401(rt) {
  try { return await verifyRefreshExists(rt); }
  catch (e) { e.message = `refresh_${e.message}`; throw e; }
}
