export function errorHandler(err, req, res, _next) {
  console.error("[error]", err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
}
