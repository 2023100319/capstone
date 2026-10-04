import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Ericahlicious — Brew & Bake · fresh coffee and baked goods";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand social-share / meta-ads image (1200×630), composed from the logo + text.
export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/logo-customer.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f4eadf 0%, #efe3d5 100%)",
          color: "#3b2417",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={168} height={168} alt="" style={{ borderRadius: "50%" }} />
        <div style={{ marginTop: 36, fontSize: 84, fontWeight: 700, letterSpacing: -1 }}>
          Ericahlicious
        </div>
        <div style={{ marginTop: 4, fontSize: 34, fontStyle: "italic", color: "#5a3a22" }}>
          Brew &amp; Bake
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: "#6e5a49" }}>
          Fresh coffee &amp; pastries · Malolos, Bulacan
        </div>
      </div>
    ),
    { ...size },
  );
}
