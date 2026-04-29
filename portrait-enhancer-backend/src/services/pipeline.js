/**
 * pipeline.js
 *
 * Tries each service in order. First success wins and returns.
 * Each service must return: { imageBase64: string, mimeType: string }
 * or throw if it fails (any error = try next).
 */

import { enhanceWithGemini }     from "./gemini.js";
import { enhanceWithStability }  from "./stability.js";
import { enhanceWithCloudinary } from "./cloudinary.js";
import { enhanceWithGFPGAN }     from "./gfpgan.js";
import { enhanceWithOpenCV }     from "./opencv.js";

const SERVICES = [
  { name: "Gemini 2.0 Flash",      fn: enhanceWithGemini,     enabled: () => !!process.env.GEMINI_API_KEY },
  { name: "Stability AI",          fn: enhanceWithStability,  enabled: () => !!process.env.STABILITY_API_KEY },
  { name: "Cloudinary AI",         fn: enhanceWithCloudinary, enabled: () => !!process.env.CLOUDINARY_CLOUD_NAME },
  { name: "GFPGAN (local Python)", fn: enhanceWithGFPGAN,     enabled: () => true },
  { name: "OpenCV (local Python)", fn: enhanceWithOpenCV,     enabled: () => true },
];

export async function runPipeline(imageBuffer, mimeType) {
  const start = Date.now();
  const log   = [];

  for (const svc of SERVICES) {
    if (!svc.enabled()) {
      log.push({ service: svc.name, status: "skipped", reason: "not configured" });
      continue;
    }

    const t0 = Date.now();
    try {
      console.log(`  → trying ${svc.name}...`);
      const result = await svc.fn(imageBuffer, mimeType);
      const ms = Date.now() - t0;

      console.log(`  ✓ ${svc.name} succeeded in ${ms}ms`);
      log.push({ service: svc.name, status: "success", ms });

      return {
        success:      true,
        usedService:  svc.name,
        imageBase64:  result.imageBase64,
        mimeType:     result.mimeType || "image/jpeg",
        pipeline:     log,
        durationMs:   Date.now() - start,
      };
    } catch (err) {
      const ms = Date.now() - t0;
      console.warn(`  ✗ ${svc.name} failed (${ms}ms): ${err.message}`);
      log.push({ service: svc.name, status: "failed", reason: err.message, ms });
    }
  }

  // All services failed — should never happen because opencv is always last
  return {
    success:    false,
    message:    "All enhancement services failed",
    pipeline:   log,
    durationMs: Date.now() - start,
  };
}
