import React, { useState, useRef, useCallback, useEffect } from "react";

const SERVICE_COLORS = {
  "Gemini 2.0 Flash":      "#8b5cf6",
  "Stability AI":          "#06b6d4",
  "Cloudinary AI":         "#f59e0b",
  "GFPGAN (local Python)": "#10b981",
  "OpenCV (local Python)": "#6b7280",
};

export default function App() {
  const [original,  setOriginal]  = useState(null); // data URL
  const [result,    setResult]    = useState(null); // { imageBase64, mimeType, usedService, pipeline, durationMs }
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [status,    setStatus]    = useState(null); // service config status
  const [dragOver,  setDragOver]  = useState(false);
  const [sliderX,   setSliderX]   = useState(50);   // comparison slider %
  const fileRef = useRef(null);

  useEffect(() => {
    fetch("/api/enhance/status")
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  const processFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setOriginal(e.target.result);
    reader.readAsDataURL(file);
    setResult(null);
    setError(null);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  const enhance = async () => {
    if (!original) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const blob = await fetch(original).then(r => r.blob());
      const form = new FormData();
      form.append("image", blob, "photo.jpg");

      const res  = await fetch("/api/enhance", { method: "POST", body: form });
      const data = await res.json();

      if (!data.success) throw new Error(data.message || "Enhancement failed");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resultUrl = result
    ? `data:${result.mimeType};base64,${result.imageBase64}`
    : null;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
          Portrait Enhancer
        </h1>
        <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
          Free pipeline tester — Gemini → Stability → Cloudinary → GFPGAN → OpenCV
        </p>
      </div>

      {/* Service status row */}
      {status && <StatusBar status={status} />}

      {/* Upload zone */}
      {!original && (
        <DropZone
          dragOver={dragOver}
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => processFile(e.target.files[0])}
      />

      {/* Main comparison area */}
      {original && (
        <div style={{ marginTop: 20 }}>
          {!result ? (
            // Before — single image + enhance button
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <img
                src={original}
                alt="original"
                style={{ width: "100%", maxHeight: 500, objectFit: "contain",
                  borderRadius: 12, border: "1px solid #2a2a2a" }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={enhance} disabled={loading} style={styles.primaryBtn}>
                  {loading ? <><Spinner /> Enhancing…</> : "✦ Enhance Portrait"}
                </button>
                <button onClick={() => { setOriginal(null); setResult(null); }} style={styles.ghostBtn}>
                  Change photo
                </button>
              </div>
            </div>
          ) : (
            // After — side-by-side comparison
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <CompareSlider original={original} result={resultUrl} />
              <ResultMeta result={result} />
              <div style={{ display: "flex", gap: 10 }}>
                <a
                  href={resultUrl}
                  download="enhanced.jpg"
                  style={{ ...styles.primaryBtn, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}
                >
                  ↓ Download enhanced
                </a>
                <button onClick={enhance} disabled={loading} style={styles.ghostBtn}>
                  Retry pipeline
                </button>
                <button onClick={() => { setOriginal(null); setResult(null); }} style={styles.ghostBtn}>
                  New photo
                </button>
              </div>
            </div>
          )}

          {loading && <PipelineProgress />}
          {error && (
            <div style={{ marginTop: 12, padding: "12px 16px", background: "#1a0a0a",
              border: "1px solid #4a1515", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Compare slider ────────────────────────────────────────────────────────────
function CompareSlider({ original, result }) {
  const [pos, setPos]   = useState(50);
  const [drag, setDrag] = useState(false);
  const ref = useRef(null);

  const update = useCallback((clientX) => {
    if (!ref.current) return;
    const { left, width } = ref.current.getBoundingClientRect();
    setPos(Math.max(2, Math.min(98, ((clientX - left) / width) * 100)));
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={e => drag && update(e.clientX)}
      onMouseUp={() => setDrag(false)}
      onMouseLeave={() => setDrag(false)}
      onTouchMove={e => update(e.touches[0].clientX)}
      style={{ position: "relative", userSelect: "none", borderRadius: 12,
        overflow: "hidden", border: "1px solid #2a2a2a", cursor: "ew-resize" }}
    >
      {/* Result (full width) */}
      <img src={result} alt="enhanced" style={{ width: "100%", display: "block", maxHeight: 520, objectFit: "contain" }} />

      {/* Original clipped over left side */}
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={original} alt="original" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>

      {/* Labels */}
      <div style={{ position: "absolute", top: 10, left: 12,
        background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 11, fontWeight: 600,
        padding: "3px 8px", borderRadius: 4, pointerEvents: "none" }}>
        ORIGINAL
      </div>
      <div style={{ position: "absolute", top: 10, right: 12,
        background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 11, fontWeight: 600,
        padding: "3px 8px", borderRadius: 4, pointerEvents: "none" }}>
        ENHANCED
      </div>

      {/* Divider + handle */}
      <div
        onMouseDown={e => { e.preventDefault(); setDrag(true); }}
        onTouchStart={() => setDrag(true)}
        style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`,
          transform: "translateX(-50%)", width: 2, background: "#fff",
          cursor: "ew-resize" }}
      >
        <div style={{ position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 32, height: 32, borderRadius: "50%",
          background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,.4)", fontSize: 14, color: "#333" }}>
          ⇔
        </div>
      </div>
    </div>
  );
}

// ── Result metadata + pipeline trace ─────────────────────────────────────────
function ResultMeta({ result }) {
  const color = SERVICE_COLORS[result.usedService] || "#888";
  return (
    <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontSize: 13, fontWeight: 600, color }}>Used: {result.usedService}</span>
        <span style={{ fontSize: 12, color: "#666", marginLeft: "auto" }}>{result.durationMs}ms total</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {result.pipeline?.map((step, i) => (
          <PipelineStep key={i} step={step} />
        ))}
      </div>
    </div>
  );
}

function PipelineStep({ step }) {
  const isSuccess = step.status === "success";
  const isSkipped = step.status === "skipped";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "4px 10px", borderRadius: 20,
      background: isSuccess ? "#0f2a1a" : isSkipped ? "#1a1a1a" : "#1a0f0f",
      border: `1px solid ${isSuccess ? "#1a4a2a" : isSkipped ? "#2a2a2a" : "#3a1515"}`,
      fontSize: 11, color: isSuccess ? "#4ade80" : isSkipped ? "#555" : "#f87171",
    }}>
      {isSuccess ? "✓" : isSkipped ? "–" : "✗"} {step.service}
      {step.ms && <span style={{ opacity: 0.6 }}>{step.ms}ms</span>}
    </div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function DropZone({ dragOver, onClick, onDrop, onDragOver, onDragLeave }) {
  return (
    <div
      onClick={onClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={{
        border: `2px dashed ${dragOver ? "#8b5cf6" : "#2a2a2a"}`,
        borderRadius: 12, padding: "60px 40px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        cursor: "pointer", transition: "border-color .2s",
        background: dragOver ? "rgba(139,92,246,.05)" : "transparent",
      }}
    >
      <div style={{ fontSize: 36 }}>📷</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>Drop a portrait here</div>
      <div style={{ fontSize: 13, color: "#666" }}>or click to browse · JPG, PNG, WEBP</div>
    </div>
  );
}

// ── Service status bar ────────────────────────────────────────────────────────
function StatusBar({ status }) {
  const services = [
    { key: "gemini",     label: "Gemini",     tier: 1, note: "1500/day" },
    { key: "stability",  label: "Stability",  tier: 2, note: "25/mo" },
    { key: "cloudinary", label: "Cloudinary", tier: 3, note: "free tier" },
    { key: "gfpgan",     label: "GFPGAN",     tier: 4, note: "local" },
    { key: "opencv",     label: "OpenCV",     tier: 5, note: "local" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
      {services.map(s => (
        <div key={s.key} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 6,
          background: "#141414", border: "1px solid #222",
          fontSize: 11, color: status[s.key] ? "#4ade80" : "#555",
        }}>
          <span>{status[s.key] ? "●" : "○"}</span>
          <span style={{ fontWeight: 500 }}>{s.tier}. {s.label}</span>
          <span style={{ color: "#444" }}>{s.note}</span>
        </div>
      ))}
    </div>
  );
}

// ── Loading progress ──────────────────────────────────────────────────────────
function PipelineProgress() {
  const [dot, setDot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDot(d => (d + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px", background: "#141414", border: "1px solid #2a2a2a", borderRadius: 8 }}>
      <Spinner />
      <span style={{ fontSize: 13, color: "#888" }}>
        Running pipeline{"...".slice(0, dot + 1)}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: "50%",
      border: "2px solid #333", borderTopColor: "#8b5cf6",
      animation: "spin .7s linear infinite",
    }} />
  );
}

const styles = {
  primaryBtn: {
    background: "#8b5cf6", color: "#fff",
    padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
    display: "flex", alignItems: "center", gap: 6,
    transition: "opacity .15s",
    opacity: 1,
  },
  ghostBtn: {
    background: "transparent", color: "#888",
    padding: "10px 16px", borderRadius: 8, fontSize: 13,
    border: "1px solid #2a2a2a",
  },
};

// CSS animation injected globally
const styleTag = document.createElement("style");
styleTag.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
document.head.appendChild(styleTag);
