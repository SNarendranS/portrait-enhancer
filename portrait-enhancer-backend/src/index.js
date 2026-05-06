import "dotenv/config";
import express from "express";
import cors    from "cors";
import { enhanceRouter }    from "./routes/enhance.js";
import { errorHandler }     from "./middleware/error.js";
import { SERVICE_REGISTRY } from "./services/registry.js";

const app  = express();
const PORT = process.env.PORT || 4000;

// Increase default socket timeout to 3 minutes — local ML models can be slow
// This prevents ECONNRESET when Python takes longer than Node's default keep-alive
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
];

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// Per-request timeout middleware — responds with JSON 503 instead of hanging/crashing
app.use((req, res, next) => {
  req.socket.setTimeout(REQUEST_TIMEOUT_MS);
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    console.error("[timeout] Request timed out:", req.method, req.path);
    if (!res.headersSent) {
      res.status(503).json({ success: false, message: "Request timed out — the enhancement took too long." });
    }
  });
  next();
});

app.use("/api/enhance", enhanceRouter);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Portrait Enhancer backend → http://localhost:${PORT}`);
  console.log("\n📋 Services:");
  for (const svc of SERVICE_REGISTRY) {
    const available = svc.isAvailable();
    console.log(`   ${available ? "✓" : "✗"} [${svc.tier.padEnd(8)}] ${svc.name}`);
  }
  console.log("");
});

// Prevent ECONNRESET on slow responses — keep-alive timeout must be
// longer than the request timeout so sockets don't close mid-response
server.keepAliveTimeout = REQUEST_TIMEOUT_MS + 5000;
server.headersTimeout   = REQUEST_TIMEOUT_MS + 10000;

// Graceful shutdown
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT",  () => server.close(() => process.exit(0)));