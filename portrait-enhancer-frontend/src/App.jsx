import React, { useState, useRef, useCallback, useEffect } from "react";

// Inject global CSS animation
const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
  * { box-sizing: border-box; }
`;
document.head.appendChild(styleTag);

// ── Colour palette per service type ──────────────────────────────────────────
const TYPE_COLOR = {
  cloud: "#8b5cf6",
  local: "#10b981",
};

function serviceColor(svc) {
  return TYPE_COLOR[svc?.type] ?? "#888";
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [original,          setOriginal]         = useState(null);   // data URL
  const [services,          setServices]         = useState([]);     // from backend
  const [servicesLoading,   setServicesLoading]  = useState(true);
  const [selected,          setSelected]         = useState(new Set()); // selected service IDs
  const [results,           setResults]          = useState([]);     // array of per-service results
  const [loading,           setLoading]          = useState(false);
  const [error,             setError]            = useState(null);
  const [dragOver,          setDragOver]         = useState(false);
  const [activeResult,      setActiveResult]     = useState(null);   // which result is shown in compare
  const fileRef = useRef(null);

  // Fetch service list from backend
  useEffect(() => {
    setServicesLoading(true);
    fetch("/api/enhance/services")
      .then(r => r.json())
      .then(data => {
        setServices(data.services ?? []);
        // Pre-select all available services
        const available = (data.services ?? []).filter(s => s.available).map(s => s.id);
        setSelected(new Set(available));
      })
      .catch(() => setServices([]))
      .finally(() => setServicesLoading(false));
  }, []);

  const processFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setOriginal(e.target.result);
    reader.readAsDataURL(file);
    setResults([]);
    setActiveResult(null);
    setError(null);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  const toggleService = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enhance = async () => {
    if (!original || selected.size === 0) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setActiveResult(null);

    try {
      const blob = await fetch(original).then(r => r.blob());
      const form = new FormData();
      form.append("image", blob, "photo.jpg");
      form.append("selectedServices", JSON.stringify([...selected]));

      const res  = await fetch("/api/enhance", { method: "POST", body: form });
      const data = await res.json();

      if (!data.success && (!data.results || data.results.length === 0)) {
        throw new Error(data.message || "All services failed");
      }

      setResults(data.results ?? []);
      // Auto-select first successful result
      const firstSuccess = data.results?.find(r => r.status === "success");
      if (firstSuccess) setActiveResult(firstSuccess.serviceId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const activeResultData = results.find(r => r.serviceId === activeResult);
  const resultUrl = activeResultData?.imageBase64
    ? `data:${activeResultData.mimeType};base64,${activeResultData.imageBase64}`
    : null;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px", color: "#e8e8e8" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.4, margin: 0 }}>
          Portrait Enhancer
        </h1>
        <p style={{ fontSize: 13, color: "#666", marginTop: 5 }}>
          Select services below, upload a photo, and compare all results side-by-side.
        </p>
      </div>

      {/* Service selector */}
      <ServiceSelector
        services={services}
        loading={servicesLoading}
        selected={selected}
        onToggle={toggleService}
      />

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

      {/* Main work area */}
      {original && (
        <div style={{ marginTop: 20 }}>
          {results.length === 0 ? (
            /* Pre-enhance: single image + button */
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <img
                src={original}
                alt="original"
                style={{ width: "100%", maxHeight: 480, objectFit: "contain",
                  borderRadius: 12, border: "1px solid #242424" }}
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={enhance}
                  disabled={loading || selected.size === 0}
                  style={{
                    ...btnStyle("primary"),
                    opacity: (loading || selected.size === 0) ? 0.5 : 1,
                    cursor: (loading || selected.size === 0) ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? <><Spinner /> Enhancing…</> : `✦ Enhance (${selected.size} service${selected.size !== 1 ? "s" : ""})`}
                </button>
                <button onClick={() => { setOriginal(null); setResults([]); }} style={btnStyle("ghost")}>
                  Change photo
                </button>
              </div>
              {selected.size === 0 && (
                <div style={{ fontSize: 13, color: "#f59e0b" }}>
                  ⚠ Select at least one service above
                </div>
              )}
            </div>
          ) : (
            /* Post-enhance: comparison + result tabs */
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Result tab bar */}
              <ResultTabs
                results={results}
                services={services}
                active={activeResult}
                onSelect={setActiveResult}
              />

              {/* Compare slider for active result */}
              {resultUrl && (
                <CompareSlider original={original} result={resultUrl} />
              )}

              {/* Failed results inline */}
              {results.filter(r => r.status === "failed").length > 0 && (
                <FailedResults results={results.filter(r => r.status === "failed")} />
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {resultUrl && (
                  <a
                    href={resultUrl}
                    download={`enhanced_${activeResult}.jpg`}
                    style={{ ...btnStyle("primary"), textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    ↓ Download ({activeResultData?.serviceName})
                  </a>
                )}
                <button onClick={enhance} disabled={loading} style={btnStyle("ghost")}>
                  {loading ? <><Spinner /> Re-running…</> : "↺ Re-run"}
                </button>
                <button onClick={() => { setOriginal(null); setResults([]); setActiveResult(null); }} style={btnStyle("ghost")}>
                  New photo
                </button>
              </div>
            </div>
          )}

          {loading && <RunningIndicator selected={selected} services={services} />}

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

// ── Service Selector ──────────────────────────────────────────────────────────
function ServiceSelector({ services, loading, selected, onToggle }) {
  if (loading) {
    return (
      <div style={{ marginBottom: 20, display: "flex", gap: 8 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{
            width: 120, height: 36, borderRadius: 8,
            background: "#1a1a1a", animation: "pulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.1}s`,
          }} />
        ))}
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div style={{ marginBottom: 20, fontSize: 13, color: "#666" }}>
        Could not load services from backend.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: "#555", fontWeight: 600, letterSpacing: 0.5,
        textTransform: "uppercase", marginBottom: 8 }}>
        Select enhancement services
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {services.map((svc, i) => {
          const isSelected  = selected.has(svc.id);
          const isAvailable = svc.available;
          const color       = serviceColor(svc);

          return (
            <button
              key={svc.id}
              onClick={() => isAvailable && onToggle(svc.id)}
              title={isAvailable ? svc.description : `Not configured — set credentials in .env`}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 8, fontSize: 12,
                border: `1px solid ${isSelected && isAvailable ? color : "#2a2a2a"}`,
                background: isSelected && isAvailable ? `${color}18` : "#141414",
                color: isAvailable ? (isSelected ? color : "#888") : "#3a3a3a",
                cursor: isAvailable ? "pointer" : "not-allowed",
                transition: "all .15s",
                userSelect: "none",
              }}
            >
              {/* Status dot */}
              <span style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: isAvailable ? (isSelected ? color : "#444") : "#2a2a2a",
              }} />
              <span style={{ fontWeight: 600 }}>
                {i + 1}. {svc.name}
              </span>
              <span style={{ color: "#444", fontSize: 10 }}>{svc.tier}</span>
              {isSelected && isAvailable && (
                <span style={{ color, fontSize: 10, fontWeight: 700 }}>✓</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "#444", marginTop: 7 }}>
        ● green = configured &nbsp;|&nbsp; ○ dim = not configured (missing API key in .env)
        &nbsp;|&nbsp; Selected services run in parallel — you'll get one result per service.
      </div>
    </div>
  );
}

// ── Result Tabs ───────────────────────────────────────────────────────────────
function ResultTabs({ results, services, active, onSelect }) {
  const serviceMap = Object.fromEntries(services.map(s => [s.id, s]));

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {results.map(r => {
        const svc       = serviceMap[r.serviceId];
        const isActive  = r.serviceId === active;
        const isSuccess = r.status === "success";
        const color     = serviceColor(svc);

        return (
          <button
            key={r.serviceId}
            onClick={() => isSuccess && onSelect(r.serviceId)}
            disabled={!isSuccess}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, fontSize: 12,
              border: `1px solid ${isActive ? color : isSuccess ? "#2a2a2a" : "#1a1a1a"}`,
              background: isActive ? `${color}20` : isSuccess ? "#141414" : "#0e0e0e",
              color: isSuccess ? (isActive ? color : "#aaa") : "#444",
              cursor: isSuccess ? "pointer" : "default",
              transition: "all .15s",
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: isSuccess ? (isActive ? color : "#444") : "#2a2a2a",
            }} />
            <span style={{ fontWeight: 600 }}>{r.serviceName}</span>
            {isSuccess ? (
              <span style={{ color: "#555", fontSize: 10 }}>{r.ms}ms</span>
            ) : (
              <span style={{ color: "#f87171", fontSize: 10 }}>failed</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Failed results detail ─────────────────────────────────────────────────────
function FailedResults({ results }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ fontSize: 12, color: "#666" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer",
          fontSize: 12, padding: 0 }}
      >
        {open ? "▾" : "▸"} {results.length} service{results.length !== 1 ? "s" : ""} failed
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {results.map(r => (
            <div key={r.serviceId} style={{
              padding: "8px 12px", background: "#100808",
              border: "1px solid #2a1515", borderRadius: 6, color: "#f87171",
            }}>
              <strong>{r.serviceName}</strong> — {r.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Running indicator ─────────────────────────────────────────────────────────
function RunningIndicator({ selected, services }) {
  const serviceMap = Object.fromEntries(services.map(s => [s.id, s]));
  const names = [...selected].map(id => serviceMap[id]?.name ?? id);

  return (
    <div style={{ marginTop: 14, padding: "12px 16px", background: "#141414",
      border: "1px solid #2a2a2a", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
      <Spinner />
      <span style={{ fontSize: 13, color: "#888" }}>
        Running {names.length} service{names.length !== 1 ? "s" : ""} in parallel:&nbsp;
        <span style={{ color: "#aaa" }}>{names.join(", ")}</span>
      </span>
    </div>
  );
}

// ── Compare Slider ────────────────────────────────────────────────────────────
function CompareSlider({ original, result }) {
  const [pos,  setPos]  = useState(50);
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
      <img src={result} alt="enhanced"
        style={{ width: "100%", display: "block", maxHeight: 520, objectFit: "contain" }} />

      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={original} alt="original"
          style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>

      <Label side="left"  text="ORIGINAL" />
      <Label side="right" text="ENHANCED" />

      <div
        onMouseDown={e => { e.preventDefault(); setDrag(true); }}
        onTouchStart={() => setDrag(true)}
        style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`,
          transform: "translateX(-50%)", width: 2, background: "#fff", cursor: "ew-resize" }}
      >
        <div style={{ position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", width: 32, height: 32, borderRadius: "50%",
          background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,.4)", fontSize: 14, color: "#333" }}>
          ⇔
        </div>
      </div>
    </div>
  );
}

function Label({ side, text }) {
  return (
    <div style={{ position: "absolute", top: 10, [side]: 12,
      background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 11, fontWeight: 600,
      padding: "3px 8px", borderRadius: 4, pointerEvents: "none" }}>
      {text}
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

// ── Shared helpers ────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
      border: "2px solid #333", borderTopColor: "#8b5cf6",
      animation: "spin .7s linear infinite" }} />
  );
}

function btnStyle(variant) {
  if (variant === "primary") return {
    background: "#8b5cf6", color: "#fff", border: "none",
    padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
    display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
  };
  return {
    background: "transparent", color: "#888",
    padding: "10px 16px", borderRadius: 8, fontSize: 13,
    border: "1px solid #2a2a2a", cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
  };
}