import "dotenv/config";
import express from "express";
import cors    from "cors";
import { enhanceRouter } from "./routes/enhance.js";
import { errorHandler }  from "./middleware/error.js";

const app  = express();
const PORT = process.env.PORT || 4000;

// Allow the Vite dev server on any port (5173 default, but it tries others)
// and any localhost origin for local dev.
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
  console.log("📋 Pipeline order: Gemini → Stability → Cloudinary → GFPGAN → OpenCV\n");
});
