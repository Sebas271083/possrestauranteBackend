import express from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit"; // 👈 para limitar /register
import { celebrate, Joi, Segments } from "celebrate"; // 👈 Joi agregado
import { loginBody, refreshBody, twofaSetupBody, twofaVerifyBody } from "../schemas/auth.schemas.js";
import { User } from "../models/index.js";
import { signAccess, issueRefreshToken, rotateRefreshToken, revokeRefreshToken, verifyRefreshExists } from "../services/auth.service.js";
import { loginLimiter, refreshLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { audit } from "../services/audit.service.js";
import { generateTwoFASecret, qrcodeDataURL, verifyTwoFA } from "../services/twofa.service.js";

const router = express.Router();

// 🔐 limiter para /register (30 req / 15min por IP)
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

// 🔑 helper para hashear passwords
const SALT_ROUNDS = 12;
async function hashPassword(pw) {
  return bcrypt.hash(pw, SALT_ROUNDS);
}

/* ===================== REGISTER ===================== */
router.post(
  "/register",
  registerLimiter,
  celebrate({
    [Segments.BODY]: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).max(72).required(),
      full_name: Joi.string().min(2).max(150).required(),
      role: Joi.string().valid("admin", "manager", "cashier", "waiter", "kitchen", "delivery").default("waiter")
    })
  }),
  async (req, res, next) => {
    try {
      const { email, password, full_name, role } = req.body;
      const exists = await User.findOne({ where: { email } });
      if (exists) return res.status(409).json({ error: "Email ya registrado" });

      const user = await User.create({
        email,
        password_hash: await hashPassword(password),
        full_name,
        role
      });

      res.status(201).json({ id: user.id, email: user.email, full_name: user.full_name, role: user.role });
    } catch (e) { next(e); }
  }
);

/* ===================== LOGIN ===================== */
router.post(
  "/auth/login",
  loginLimiter,
  celebrate({ [Segments.BODY]: loginBody }),
  async (req, res, next) => {
    try {
      const { email, password, twofa_token } = req.body;
      const user = await User.findOne({ where: { email } });
      console.log("user", user, password)
      if (!user || !user.is_active) return res.status(401).json({ error: "Credenciales inválidas" });

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

      console.log("LOGIN raw:", { email });
console.log("PW len/bytes:", password.length, Array.from(password).map(c => c.charCodeAt(0)));

      // Si el user tiene 2FA habilitado, exigir token
      if (user.twofa_enabled) {
        if (!twofa_token) return res.status(412).json({ error: "Requiere 2FA", need_twofa: true });
        const valid = verifyTwoFA({ secretBase32: user.twofa_secret, token: twofa_token });
        if (!valid) return res.status(401).json({ error: "2FA inválido" });
      }
      // TEMP en auth.routes.js, arriba del signAccess:
      console.log("JWT_ACCESS_SECRET?", !!process.env.JWT_ACCESS_SECRET, "JWT_REFRESH_SECRET?", !!process.env.JWT_REFRESH_SECRET);

      const access = signAccess(user);
      const refresh = await issueRefreshToken(user, { ip: req.ip, user_agent: req.get("user-agent") });

      await audit({ user_id: user.id, action: "AUTH_LOGIN", entity: "User", entity_id: user.id, meta: { ip: req.ip } });
      res.json({ access_token: access, refresh_token: refresh, expires_in: Number(process.env.JWT_ACCESS_TTL || 900) });
    } catch (e) { next(e); }
  }
);

/* ===================== REFRESH ===================== */
router.post(
  "/auth/refresh",
  refreshLimiter,
  celebrate({ [Segments.BODY]: refreshBody }),
  async (req, res, next) => {
    try {
      const { refresh_token } = req.body;
      await verifyRefreshExists(refresh_token); // existe y no expiró
      const { user, refreshToken, accessToken } = await rotateRefreshToken(refresh_token, { ip: req.ip, user_agent: req.get("user-agent") });
      await audit({ user_id: user.id, action: "AUTH_REFRESH", entity: "User", entity_id: user.id });
      res.json({ access_token: accessToken, refresh_token: refreshToken, expires_in: Number(process.env.JWT_ACCESS_TTL || 900) });
    } catch (e) {
      if (e.message?.startsWith("refresh_")) return res.status(401).json({ error: e.message });
      next(e);
    }
  }
);

/* ===================== LOGOUT ===================== */
router.post(
  "/auth/logout",
  celebrate({ [Segments.BODY]: refreshBody }),
  async (req, res, next) => {
    try {
      const { refresh_token } = req.body;
      await revokeRefreshToken(refresh_token);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

/* ===================== 2FA SETUP ===================== */
router.post(
  "/auth/2fa/setup",
  requireAuth,
  celebrate({ [Segments.BODY]: twofaSetupBody }),
  async (req, res, next) => {
    try {
      const user = await User.findByPk(req.user.sub);
      const { base32, otpauth_url } = generateTwoFASecret("POS Resto", user.email);
      const qr = await qrcodeDataURL(otpauth_url);
      await user.update({ twofa_secret: base32, twofa_enabled: false });
      res.json({ otpauth_url, qr_data_url: qr, base32 });
    } catch (e) { next(e); }
  }
);

/* ===================== 2FA VERIFY ===================== */
router.post(
  "/auth/2fa/verify",
  requireAuth,
  celebrate({ [Segments.BODY]: twofaVerifyBody }),
  async (req, res, next) => {
    try {
      const user = await User.findByPk(req.user.sub);
      if (!user.twofa_secret) return res.status(400).json({ error: "No hay 2FA pendiente de activar" });
      const ok = verifyTwoFA({ secretBase32: user.twofa_secret, token: req.body.token });
      if (!ok) return res.status(401).json({ error: "Token 2FA inválido" });
      await user.update({ twofa_enabled: true });
      await audit({ user_id: user.id, action: "AUTH_2FA_ENABLE", entity: "User", entity_id: user.id });
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

/* ===================== 2FA DISABLE ===================== */
router.post(
  "/auth/2fa/disable",
  requireAuth,
  celebrate({ [Segments.BODY]: twofaVerifyBody }),
  async (req, res, next) => {
    try {
      const user = await User.findByPk(req.user.sub);
      if (!user.twofa_enabled) return res.status(400).json({ error: "2FA no está habilitado" });
      const ok = verifyTwoFA({ secretBase32: user.twofa_secret, token: req.body.token });
      if (!ok) return res.status(401).json({ error: "Token 2FA inválido" });
      await user.update({ twofa_enabled: false, twofa_secret: null });
      await audit({ user_id: user.id, action: "AUTH_2FA_DISABLE", entity: "User", entity_id: user.id });
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

export default router;
