import express from "express";
import multer  from "multer";
import { runSelected }      from "../services/runner.js";
import { SERVICE_REGISTRY } from "../services/registry.js";

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
 * GET /api/enhance/services
 *
 * Returns the full service list with availability flags.
 * Frontend uses this to build the service selector — nothing is hardcoded.
 *
 * Response shape:
 * {
 *   services: [
 *     { id, name, tier, type, description, available: true|false }
 *   ]
 * }
 */
enhanceRouter.get("/services", (_, res) => {
  const services = SERVICE_REGISTRY.map(svc => ({
    id:          svc.id,
    name:        svc.name,
    tier:        svc.tier,
    type:        svc.type,
    description: svc.description,
    available:   svc.isAvailable(),
  }));
  res.json({ services });
});

/**
 * POST /api/enhance
 *
 * Body: multipart/form-data
 *   image            — image file
 *   selectedServices — JSON array of service IDs, e.g. '["gemini","opencv"]'
 *                      If omitted, runs all available services.
 *
 * Response:
 * {
 *   success: boolean,
 *   results: [
 *     { serviceId, serviceName, status: "success"|"failed",
 *       ms, imageBase64?, mimeType?, error? }
 *   ],
 *   durationMs: number
 * }
 */
enhanceRouter.post("/", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    // Parse selectedServices (sent as JSON string in form-data)
    let selectedIds;
    if (req.body.selectedServices) {
      try {
        selectedIds = JSON.parse(req.body.selectedServices);
      } catch {
        return res.status(400).json({ success: false, message: "selectedServices must be a JSON array of service IDs" });
      }
    } else {
      // Default: run all available services
      selectedIds = SERVICE_REGISTRY.filter(s => s.isAvailable()).map(s => s.id);
    }

    console.log(`\n🖼  Enhancing with services: [${selectedIds.join(", ")}]`);

    const result = await runSelected(selectedIds, req.file.buffer, req.file.mimetype);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Legacy status endpoint — kept for backwards compatibility ──────────────────
/** @deprecated Use GET /api/enhance/services instead */
enhanceRouter.get("/status", (_, res) => {
  const legacy = {};
  for (const svc of SERVICE_REGISTRY) {
    legacy[svc.id] = svc.isAvailable();
  }
  res.json(legacy);
});