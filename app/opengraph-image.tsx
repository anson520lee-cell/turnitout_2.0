import { ImageResponse } from "next/og";
import { brand } from "@/config/app";

// The picture shown when a link to the site is shared (WhatsApp, Instagram, X, …).
export const alt = `${brand.name} · ${brand.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "radial-gradient(circle at 78% 30%, rgba(91,140,255,0.35), rgba(154,123,255,0.12) 38%, #04060b 70%)",
          backgroundColor: "#04060b",
          color: "#eef2ff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, color: "#a9c1ff", letterSpacing: 4, textTransform: "uppercase" }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#5fd8f5", boxShadow: "0 0 18px #5fd8f5" }} />
          Writing checks before you submit
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 220,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: -8,
              backgroundImage: "linear-gradient(100deg, #eef2ff 0%, #b9c8ff 40%, #b3a2ff 70%, #8f7bff 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {brand.name}
          </div>
          <div style={{ fontSize: 60, fontWeight: 600, marginTop: 12 }}>{brand.tagline}</div>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 28, color: "#9aa3bf" }}>
          <span>Free writing scan</span>
          <span style={{ color: "#5b8cff" }}>·</span>
          <span>AI &amp; similarity reports</span>
          <span style={{ color: "#5b8cff" }}>·</span>
          <span>Writing refinement</span>
        </div>
      </div>
    ),
    size,
  );
}
