import express from "express";
import multer from "multer";
import { runPipeline } from "../services/pipeline.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

export const enhanceRouter = express.Router();

/**
 * POST /api/enhance
 * Body: multipart/form-data  { image: File }
 * Returns: JSON { success, pipeline, usedService, imageBase64, mimeType, durationMs }
 */
enhanceRouter.post("/", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    const result = await runPipeline(req.file.buffer, req.file.mimetype);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/enhance/status — shows which services are configured */
enhanceRouter.get("/status", (_, res) => {
  res.json({
    gemini:     !!process.env.GEMINI_API_KEY,
    stability:  !!process.env.STABILITY_API_KEY,
    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    gfpgan:     true, // always available (local)
    opencv:     true, // always available (local)
  });
});
