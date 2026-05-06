export function errorHandler(err, req, res, _next) {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";
  console.error(`[error] ${req.method} ${req.path} → ${status}: ${message}`);
  if (err.stack) console.error(err.stack);

  // Always respond with JSON so the frontend never gets "Unexpected end of JSON input"
  if (!res.headersSent) {
    res.status(status).json({ success: false, message });
  }
}
