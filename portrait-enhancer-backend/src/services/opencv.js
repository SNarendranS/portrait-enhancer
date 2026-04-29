/**
 * OpenCV + Pillow — rule-based, always works, no models needed
 * Bilateral filter, CLAHE, teeth whitening, sharpening.
 * Not AI, but deterministic and instant. The unbreakable floor.
 */

import { spawnSync }  from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir }     from "os";
import { join }       from "path";
import { fileURLToPath } from "url";
import { dirname }       from "path";

const __dir      = dirname(fileURLToPath(import.meta.url));
const PYTHON_CMD = process.env.PYTHON_CMD || detectPython();
const SCRIPT     = join(__dir, "../../python/enhance_opencv.py");

function detectPython() {
  for (const cmd of ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cmd;
  }
  return "python3";
}

export async function enhanceWithOpenCV(imageBuffer, mimeType) {
  if (!existsSync(SCRIPT)) throw new Error("OpenCV script not found — run npm run setup");

  const ext    = mimeType === "image/png" ? ".png" : ".jpg";
  const inPath  = join(tmpdir(), `cv_in_${Date.now()}${ext}`);
  const outPath = join(tmpdir(), `cv_out_${Date.now()}.jpg`);

  try {
    writeFileSync(inPath, imageBuffer);

    const result = spawnSync(
      PYTHON_CMD,
      [SCRIPT, "--input", inPath, "--output", outPath],
      { timeout: 30_000, encoding: "utf8" }
    );

    if (result.status !== 0) {
      throw new Error(result.stderr?.slice(0, 500) || "OpenCV process failed");
    }

    if (!existsSync(outPath)) throw new Error("OpenCV produced no output file");

    return {
      imageBase64: readFileSync(outPath).toString("base64"),
      mimeType:    "image/jpeg",
    };
  } finally {
    try { if (existsSync(inPath))  unlinkSync(inPath);  } catch (_) {}
    try { if (existsSync(outPath)) unlinkSync(outPath); } catch (_) {}
  }
}
