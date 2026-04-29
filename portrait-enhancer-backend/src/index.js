import "dotenv/config";
import express from "express";
import cors    from "cors";
import { enhanceRouter }    from "./routes/enhance.js";
import { errorHandler }     from "./middleware/error.js";
import { SERVICE_REGISTRY } from "./services/registry.js";

const app  = express();
const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
];

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

app.use("/api/enhance", enhanceRouter);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🚀 Portrait Enhancer backend → http://localhost:${PORT}`);
  console.log("\n📋 Services:");
  for (const svc of SERVICE_REGISTRY) {
    const available = svc.isAvailable();
    console.log(`   ${available ? "✓" : "✗"} [${svc.tier.padEnd(8)}] ${svc.name}`);
  }
  console.log("");
});