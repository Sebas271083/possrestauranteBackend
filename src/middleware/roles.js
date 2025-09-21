export function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.user; // seteado por requireAuth
    if (!user) return res.status(401).json({ error: "No autenticado" });
    if (!roles.includes(user.role)) return res.status(403).json({ error: "Permiso denegado" });
    next();
  };
}
