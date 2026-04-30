/**
 * Real-ESRGAN only pipeline — local Python, no face model needed
 * Uses Real-ESRGAN x4plus for upscaling + sharpness, then OpenCV post-process.
 * Faster than GFPGAN (no face detection), better for overall image quality.
 * Model: RealESRGAN_x4plus (~67MB) — already downloaded by download_models.py
 *
 * This covers what GFPGAN misses: background clarity, overall sharpness, exposure.
 */

import { spawnSync }   from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir }      from "os";
import { join }        from "path";
import { fileURLToPath } from "url";
import { dirname }       from "path";

const __dir  = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dir, "../../python/enhance_realesrgan.py");

function resolvePython() {
  const fromEnv = process.env.PYTHON_CMD;
  if (fromEnv) {
    const normalized = fromEnv.replace(/\\/g, "/");
    const r = spawnSync(normalized, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return normalized;
    throw new Error(`Python not found at "${normalized}". Set PYTHON_CMD in .env with forward slashes.`);
  }
  for (const cmd of ["python3", "python"]) {
    if (spawnSync(cmd, ["--version"], { encoding: "utf8" }).status === 0) return cmd;
  }
  throw new Error("Python not found. Set PYTHON_CMD in .env");
}

export async function enhanceWithRealESRGAN(imageBuffer, mimeType) {
  if (!existsSync(SCRIPT)) throw new Error("Real-ESRGAN script missing — check python/ folder");

  const python  = resolvePython();
  const ext     = mimeType === "image/png" ? ".png" : ".jpg";
  const inPath  = join(tmpdir(), `esrgan_in_${Date.now()}${ext}`).replace(/\\/g, "/");
  const outPath = join(tmpdir(), `esrgan_out_${Date.now()}.jpg`).replace(/\\/g, "/");
  const script  = SCRIPT.replace(/\\/g, "/");

  try {
    writeFileSync(inPath, imageBuffer);

    const proc = spawnSync(
      python,
      ["-W", "ignore", script, "--input", inPath, "--output", outPath],
      {
        timeout:  180_000,
        encoding: "utf8",
        env: { ...process.env, PYTHONWARNINGS: "ignore" },
      }
    );

    if (proc.status === null) throw new Error("Real-ESRGAN timed out (3 min)");
    if (proc.status !== 0) {
      const err = (proc.stderr || "")
        .split("\n")
        .filter(l => !l.includes("UserWarning") && !l.includes("warnings.warn") && l.trim())
        .join("\n").slice(0, 400);
      throw new Error(err || "Real-ESRGAN process failed");
    }
    if (!existsSync(outPath)) throw new Error("Real-ESRGAN produced no output");

    return { imageBase64: readFileSync(outPath).toString("base64"), mimeType: "image/jpeg" };
  } finally {
    try { unlinkSync(inPath);  } catch (_) {}
    try { unlinkSync(outPath); } catch (_) {}
  }
}
