import { enhanceWithGemini }      from "./gemini.js";
import { enhanceWithStability }   from "./stability.js";
import { enhanceWithCloudinary }  from "./cloudinary.js";
import { enhanceWithPicwish }     from "./picwish.js";
import { enhanceWithGFPGAN }      from "./gfpgan.js";
import { enhanceWithRealESRGAN }  from "./realesrgan.js";
import { enhanceWithOpenCV }      from "./opencv.js";

export const SERVICES = [
  { id: "gemini",     name: "Gemini 2.5 Flash",      tier: "☁ Cloud",  note: "1500/day",   fn: enhanceWithGemini,     enabled: () => !!process.env.GEMINI_API_KEY },
  { id: "stability",  name: "Stability AI",           tier: "☁ Cloud",  note: "25/mo",      fn: enhanceWithStability,  enabled: () => !!process.env.STABILITY_API_KEY },
  { id: "cloudinary", name: "Cloudinary AI",          tier: "☁ Cloud",  note: "free tier",  fn: enhanceWithCloudinary, enabled: () => !!process.env.CLOUDINARY_CLOUD_NAME },
  { id: "picwish",    name: "PicWish",                tier: "☁ Cloud",  note: "3/day",      fn: enhanceWithPicwish,    enabled: () => !!process.env.PICWISH_API_KEY },
  { id: "gfpgan",     name: "GFPGAN (local)",         tier: "🖥 Local",  note: "unlimited",  fn: enhanceWithGFPGAN,     enabled: () => true },
  { id: "realesrgan", name: "Real-ESRGAN (local)",    tier: "🖥 Local",  note: "unlimited",  fn: enhanceWithRealESRGAN, enabled: () => true },
  { id: "opencv",     name: "OpenCV (local)",         tier: "🖥 Local",  note: "unlimited",  fn: enhanceWithOpenCV,     enabled: () => true },
];

export async function runPipeline(imageBuffer, mimeType, selectedIds = null) {
  const start    = Date.now();
  const log      = [];
  const services = selectedIds
    ? SERVICES.filter(s => selectedIds.includes(s.id))
    : SERVICES;

  for (const svc of services) {
    if (!svc.enabled()) {
      log.push({ id: svc.id, service: svc.name, status: "skipped", reason: "not configured" });
      continue;
    }

    const t0 = Date.now();
    try {
      console.log(`  → starting ${svc.name}…`);
      const result = await svc.fn(imageBuffer, mimeType);
      const ms = Date.now() - t0;
      console.log(`  ✓ ${svc.name} done in ${ms}ms`);
      log.push({ id: svc.id, service: svc.name, status: "success", ms });

      return {
        success:     true,
        usedService: svc.name,
        imageBase64: result.imageBase64,
        mimeType:    result.mimeType || "image/jpeg",
        pipeline:    log,
        durationMs:  Date.now() - start,
      };
    } catch (err) {
      const ms = Date.now() - t0;
      console.warn(`  ✗ ${svc.name} failed in ${ms}ms: ${err.message}`);
      log.push({ id: svc.id, service: svc.name, status: "failed", reason: err.message, ms });
    }
  }

  return {
    success:    false,
    message:    "All enhancement services failed",
    pipeline:   log,
    durationMs: Date.now() - start,
  };
}

// Run all selected services in PARALLEL — returns one result per service
export async function runParallel(imageBuffer, mimeType, selectedIds = null) {
  const start    = Date.now();
  const services = selectedIds
    ? SERVICES.filter(s => selectedIds.includes(s.id))
    : SERVICES;

  const results = await Promise.allSettled(
    services.map(async svc => {
      if (!svc.enabled()) return { serviceId: svc.id, serviceName: svc.name, status: "skipped", error: "not configured" };
      const t0 = Date.now();
      try {
        console.log(`  → starting ${svc.name}…`);
        const result = await svc.fn(imageBuffer, mimeType);
        const ms = Date.now() - t0;
        console.log(`  ✓ ${svc.name} done in ${ms}ms`);
        return { serviceId: svc.id, serviceName: svc.name, status: "success", ms, imageBase64: result.imageBase64, mimeType: result.mimeType || "image/jpeg" };
      } catch (err) {
        const ms = Date.now() - t0;
        console.warn(`  ✗ ${svc.name} failed in ${ms}ms: ${err.message}`);
        return { serviceId: svc.id, serviceName: svc.name, status: "failed", error: err.message, ms };
      }
    })
  );

  return {
    success:    true,
    results:    results.map(r => r.value ?? { status: "error", reason: r.reason?.message }),
    durationMs: Date.now() - start,
  };
}
