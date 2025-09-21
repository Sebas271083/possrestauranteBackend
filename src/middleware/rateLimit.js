import rateLimit from "express-rate-limit";

export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 20,                  // 20 intentos / ventana / IP
  standardHeaders: true,
  legacyHeaders: false
});

export const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60
});
