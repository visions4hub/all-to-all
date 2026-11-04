// Cuts the brand artwork (assets/brand-source.webp, supplied by the owner) into the
// files the site uses, unchanged except for removing the black background:
//   public/brand/mark.png       the knot, transparent background
//   public/brand/wordmark.png   "ALL TO ALL / BY VISIONS", transparent background
//   public/brand/app-icon.png   the rounded black app icon, as drawn (512 px)
//   public/icon-*.png, public/apple-touch-icon.png   browser and phone icons
//   public/og.jpg                link preview (WhatsApp, Telegram, X…)
// Run with: node scripts/build-brand.mjs   (outputs are committed; not part of the build)
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "assets/brand-source.webp";
mkdirSync("public/brand", { recursive: true });

// Regions in the 1774×887 artwork.
const REGIONS = {
  mark: { left: 196, top: 100, width: 470, height: 450 },
  wordmark: { left: 108, top: 548, width: 660, height: 160 },
  appIcon: { left: 1146, top: 532, width: 276, height: 270 },
};

/**
 * Turns the near-black background transparent. Alpha follows brightness, and the
 * colour is un-premultiplied so the gold keeps its hue at the soft edges.
 */
async function knockOutBlack(region, out, { low = 18, high = 64, width } = {}) {
  const { data, info } = await sharp(SRC).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const a = Math.max(0, Math.min(1, (lum - low) / (high - low)));
    if (a === 0) {
      data[i + 3] = 0;
      continue;
    }
    // Remove the black that was mixed into the edge pixels.
    data[i] = Math.min(255, r / a);
    data[i + 1] = Math.min(255, g / a);
    data[i + 2] = Math.min(255, b / a);
    data[i + 3] = Math.round(a * 255);
  }
  let img = sharp(data, { raw: info }).trim({ threshold: 1 });
  if (width) img = img.resize({ width, withoutEnlargement: false });
  await img.png({ compressionLevel: 9 }).toFile(out);
}

await knockOutBlack(REGIONS.mark, "public/brand/mark.png", { width: 512 });
await knockOutBlack(REGIONS.wordmark, "public/brand/wordmark.png", { low: 22, high: 70, width: 900 });

// App icon as drawn (black tile included), square.
const icon = sharp(SRC).extract(REGIONS.appIcon).resize(512, 512, { fit: "cover" });
await icon.clone().png().toFile("public/brand/app-icon.png");
await icon.clone().resize(192, 192).png().toFile("public/icon-192.png");
await icon.clone().resize(180, 180).png().toFile("public/apple-touch-icon.png");
await icon.clone().resize(48, 48).png().toFile("public/icon-48.png");
await icon.clone().resize(32, 32).png().toFile("public/icon-32.png");

// Link preview (Open Graph, 1200×630): the whole artwork, letterboxed on its own black,
// so nothing is cropped.
await sharp(SRC)
  .resize(1200, 630, { fit: "contain", background: "#090908" })
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile("public/og.jpg"); // JPEG keeps it under ~300 KB, which some apps (WhatsApp) need

// GitHub social preview (1280×640, the artwork is already 2:1).
await sharp(SRC).resize(1280, 640, { fit: "contain", background: "#090908" }).png().toFile("assets/social-preview.png");

console.log("Brand files written to public/brand and public/");
