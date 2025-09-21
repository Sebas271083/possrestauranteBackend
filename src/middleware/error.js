export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;

  // Log SIEMPRE
  console.error("API_ERROR", {
    path: req.originalUrl,
    status,
    message: err.message,
    stack: err.stack
  });

  // En dev mostramos más info; en prod mantenemos genérico
  if (process.env.NODE_ENV !== "production") {
    return res.status(status).json({
      error: err.message || "Error interno",
      stack: err.stack?.split("\n").slice(0, 3).join("\n")
    });
  }

  res.status(status).json({ error: "Error interno" });
}
