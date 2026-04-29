/**
 * services/runner.js
 *
 * Runs ALL selected services in PARALLEL and returns ALL their results.
 * No waterfall/fallback — every selected service gets a chance.
 *
 * This replaces the old pipeline.js waterfall approach.
 */

import { SERVICE_MAP } from "./registry.js";

/**
 * Run selected services in parallel.
 *
 * @param {string[]} selectedIds  — array of service IDs to run
 * @param {Buffer}   imageBuffer  — raw image bytes
 * @param {string}   mimeType     — e.g. "image/jpeg"
 * @returns {Promise<RunnerResult>}
 */
export async function runSelected(selectedIds, imageBuffer, mimeType) {
  const start = Date.now();

  if (!selectedIds || selectedIds.length === 0) {
    return { success: false, message: "No services selected", results: [], durationMs: 0 };
  }

  // Resolve service definitions, skip unknowns
  const services = selectedIds
    .map(id => SERVICE_MAP[id])
    .filter(Boolean);

  if (services.length === 0) {
    return { success: false, message: "No valid services found for given IDs", results: [], durationMs: 0 };
  }

  // Run all selected services concurrently
  const settled = await Promise.allSettled(
    services.map(async svc => {
      if (!svc.isAvailable()) {
        throw new Error(`${svc.name} is not configured — missing API key/credentials`);
      }
      const t0 = Date.now();
      console.log(`  → starting ${svc.name}…`);
      try {
        const result = await svc.fn(imageBuffer, mimeType);
        const ms = Date.now() - t0;
        console.log(`  ✓ ${svc.name} done in ${ms}ms`);
        return { svc, result, ms };
      } catch (err) {
        const ms = Date.now() - t0;
        console.warn(`  ✗ ${svc.name} failed in ${ms}ms: ${err.message}`);
        throw { svc, err, ms };
      }
    })
  );

  // Shape results
  const results = settled.map((outcome, i) => {
    const svc = services[i];
    if (outcome.status === "fulfilled") {
      const { result, ms } = outcome.value;
      return {
        serviceId:   svc.id,
        serviceName: svc.name,
        status:      "success",
        ms,
        imageBase64: result.imageBase64,
        mimeType:    result.mimeType || "image/jpeg",
      };
    } else {
      const { err, ms } = outcome.reason ?? {};
      return {
        serviceId:   svc.id,
        serviceName: svc.name,
        status:      "failed",
        ms:          ms ?? 0,
        error:       err?.message ?? String(outcome.reason),
      };
    }
  });

  const anySuccess = results.some(r => r.status === "success");

  return {
    success:    anySuccess,
    results,
    durationMs: Date.now() - start,
  };
}