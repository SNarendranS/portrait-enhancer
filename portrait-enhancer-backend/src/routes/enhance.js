import express from "express";
import multer  from "multer";
import { runPipeline, runParallel, SERVICES } from "../services/pipeline.js";

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
    const selected = req.body.services ? JSON.parse(req.body.services) : null;
    console.log(`\nfile: ${req.file.originalname} size: ${req.file.size}`);
    console.log(`🖼  Enhancing with services: ${JSON.stringify(selected ?? "all")}`);
    const result = await runParallel(req.file.buffer, req.file.mimetype, selected);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/enhance/status
enhanceRouter.get("/status", (_, res) => {
  res.json(
    Object.fromEntries(SERVICES.map(s => [s.id, {
      configured: s.enabled(),
      name: s.name,
      tier: s.tier,
      note: s.note,
    }]))
  );
});
