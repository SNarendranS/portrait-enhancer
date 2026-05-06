import "dotenv/config";
import express from "express";
import cors    from "cors";
import { enhanceRouter }    from "./routes/enhance.js";
import { errorHandler }     from "./middleware/error.js";
import { SERVICE_REGISTRY } from "./services/registry.js";

const app  = express();
const PORT = process.env.PORT || 4000;

// 10 minutes — GFPGAN and Real-ESRGAN load ~340 MB + ~65 MB of model weights
// on first run, which takes 3-7 minutes on a typical laptop.
// The old 3-minute timeout was firing before they finished, sending a 503,
// then when the models completed Express tried to send a second response and
// crashed with ERR_HTTP_HEADERS_SENT.
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
];

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// Per-request timeout middleware
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

server.keepAliveTimeout = REQUEST_TIMEOUT_MS + 5000;
server.headersTimeout   = REQUEST_TIMEOUT_MS + 10000;

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT",  () => server.close(() => process.exit(0)));
