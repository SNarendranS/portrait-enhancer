import { spawnSync }   from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir }      from "os";
import { join }        from "path";
import { fileURLToPath } from "url";
import { dirname }       from "path";

const __dir  = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dir, "../../python/enhance_opencv.py");

function resolvePython() {
  const fromEnv = process.env.PYTHON_CMD;
  if (fromEnv) {
    const normalized = fromEnv.replace(/\\/g, "/");
    const result = spawnSync(normalized, ["--version"], { encoding: "utf8" });
    if (result.status === 0) return normalized;
    throw new Error(
      `Python executable not found: "${normalized}"\n` +
      `In your .env, set PYTHON_CMD using FORWARD SLASHES, e.g.:\n` +
      `PYTHON_CMD=C:/Python311/python.exe`
    );
  }

  for (const cmd of ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cmd;
  }

  throw new Error(
    `Python not found in PATH.\n` +
    `Install Python 3.9+ or set PYTHON_CMD in your .env:\n` +
    `PYTHON_CMD=C:/Python311/python.exe`
  );
}

export async function enhanceWithOpenCV(imageBuffer, mimeType) {
  if (!existsSync(SCRIPT)) throw new Error("OpenCV script missing — check python/ folder");

  const python  = resolvePython();
  const ext     = mimeType === "image/png" ? ".png" : ".jpg";
  const inPath  = join(tmpdir(), `cv_in_${Date.now()}${ext}`).replace(/\\/g, "/");
  const outPath = join(tmpdir(), `cv_out_${Date.now()}.jpg`).replace(/\\/g, "/");
  const script  = SCRIPT.replace(/\\/g, "/");

  try {
    writeFileSync(inPath, imageBuffer);

    const proc = spawnSync(python, [script, "--input", inPath, "--output", outPath], {
      timeout:  30_000,
      encoding: "utf8",
    });

    if (proc.status !== 0) throw new Error(proc.stderr?.slice(0, 500) || "OpenCV process failed");
    if (!existsSync(outPath)) throw new Error("OpenCV produced no output file");

    return { imageBase64: readFileSync(outPath).toString("base64"), mimeType: "image/jpeg" };
  } finally {
    try { unlinkSync(inPath);  } catch (_) {}
    try { unlinkSync(outPath); } catch (_) {}
  }
}
