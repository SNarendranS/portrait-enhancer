import express from "express";
import multer  from "multer";
import { runSelected }      from "../services/runner.js";
import { SERVICE_REGISTRY } from "../services/registry.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    file.mimetype.startsWith("image/") ? cb(null, true) : cb(new Error("Only image files allowed"));
  },
});

export const enhanceRouter = express.Router();

// POST /api/enhance  — parallel mode (all selected services run simultaneously)
enhanceRouter.post("/", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    const raw = req.body.selectedServices ?? req.body.services ?? null;
    const selected = raw ? JSON.parse(raw) : SERVICE_REGISTRY.map(s => s.id);

    console.log(`\nfile: ${req.file.originalname} size: ${req.file.size}`);
    console.log(`Enhancing with services: ${JSON.stringify(selected)}`);

    const result = await runSelected(selected, req.file.buffer, req.file.mimetype);

    // Guard: timeout middleware may have already sent a 503 while local
    // models (GFPGAN / Real-ESRGAN) were still running. Without this check
    // Express throws ERR_HTTP_HEADERS_SENT and crashes the request handler.
    if (!res.headersSent) {
      res.json(result);
    } else {
      console.log("[enhance] response already sent (timeout); discarding late result.");
    }
  } catch (err) {
    if (!res.headersSent) next(err);
  }
});

// GET /api/enhance/services
enhanceRouter.get("/services", (_, res) => {
  res.json({
    services: SERVICE_REGISTRY.map(s => ({
      id:          s.id,
      name:        s.name,
      tier:        s.tier,
      type:        s.type,
      description: s.description,
      available:   s.isAvailable(),
    })),
  });
});

// GET /api/enhance/status  — backwards-compat alias
enhanceRouter.get("/status", (_, res) => {
  res.json({
    services: SERVICE_REGISTRY.map(s => ({
      id:          s.id,
      name:        s.name,
      tier:        s.tier,
      type:        s.type,
      description: s.description,
      available:   s.isAvailable(),
    })),
  });
});
