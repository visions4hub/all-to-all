// Phase 2 — reserved capabilities. NOT implemented, NOT shown in the UI.
// Nothing in src/app or src/components may import this file.
// Before Phase 2, re-check each item: if it can run reliably in the browser with
// freely licensed libraries, it can move to Phase 1 without any paid service.

export type FutureFeature = {
  id: string;
  group: "ai" | "ocr-conversion" | "security-signature" | "image-advanced" | "cloud";
  name: string;
  /** Why it is not in Phase 1. */
  reason: string;
};

export const PHASE_2_FEATURES: FutureFeature[] = [
  { id: "ai-summarize", group: "ai", name: "AI PDF Summarizer", reason: "Needs an AI model" },
  { id: "ai-translate", group: "ai", name: "AI PDF Translator", reason: "Needs an AI model" },
  { id: "ai-smart-split", group: "ai", name: "AI Smart Split", reason: "Needs an AI model" },
  { id: "ai-classify", group: "ai", name: "AI Document Classification", reason: "Needs an AI model" },
  { id: "ai-form-recognition", group: "ai", name: "AI Form Recognition", reason: "Needs an AI model" },
  { id: "ai-redaction", group: "ai", name: "AI Smart Redaction", reason: "Needs an AI model" },
  { id: "ai-semantic-compare", group: "ai", name: "AI Semantic PDF Comparison", reason: "Needs an AI model" },
  { id: "ai-bg-removal", group: "ai", name: "AI Background Removal", reason: "Needs an AI model" },
  { id: "ai-upscale", group: "ai", name: "AI Image Upscaling", reason: "Needs an AI model" },
  { id: "face-detection", group: "ai", name: "Automatic Face Detection", reason: "Needs an AI model" },
  { id: "object-detection", group: "ai", name: "AI Object Detection", reason: "Needs an AI model" },
  { id: "layout-analysis", group: "ai", name: "Advanced Document Layout Analysis", reason: "Needs an AI model" },

  { id: "ocr", group: "ocr-conversion", name: "Advanced OCR for scanned PDFs", reason: "Heavy engine; quality not yet verified locally" },
  { id: "ocr-word", group: "ocr-conversion", name: "OCR to Word", reason: "Depends on OCR" },
  { id: "ocr-excel", group: "ocr-conversion", name: "OCR to Excel", reason: "Depends on OCR" },
  { id: "ocr-ppt", group: "ocr-conversion", name: "OCR to PowerPoint", reason: "Depends on OCR" },
  { id: "pdf-word", group: "ocr-conversion", name: "PDF to editable Word", reason: "Layout reconstruction not reliable in-browser" },
  { id: "pdf-excel", group: "ocr-conversion", name: "PDF to editable Excel", reason: "Table reconstruction not reliable in-browser" },
  { id: "pdf-ppt", group: "ocr-conversion", name: "PDF to editable PowerPoint", reason: "Layout reconstruction not reliable in-browser" },
  { id: "word-pdf", group: "ocr-conversion", name: "Word to PDF (high fidelity)", reason: "Needs an office rendering engine" },
  { id: "excel-pdf", group: "ocr-conversion", name: "Excel to PDF", reason: "Needs an office rendering engine" },
  { id: "ppt-pdf", group: "ocr-conversion", name: "PowerPoint to PDF", reason: "Needs an office rendering engine" },
  { id: "html-pdf", group: "ocr-conversion", name: "HTML/URL to PDF", reason: "Needs a headless browser server" },
  { id: "html-image", group: "ocr-conversion", name: "HTML/URL to Image", reason: "Needs a headless browser server" },
  { id: "pdf-markdown", group: "ocr-conversion", name: "PDF to Markdown (advanced)", reason: "Layout reconstruction" },
  { id: "pdf-images-extract", group: "ocr-conversion", name: "Advanced embedded image extraction", reason: "Many image encodings to support" },
  { id: "pdfa", group: "ocr-conversion", name: "PDF/A conversion and validation", reason: "Needs a validated engine" },
  { id: "pdf-repair", group: "ocr-conversion", name: "PDF repair", reason: "Needs a validated engine" },

  { id: "crypto-sign", group: "security-signature", name: "Cryptographic digital signatures", reason: "Certificates and trust chain" },
  { id: "remote-sign", group: "security-signature", name: "Multi-party remote signing", reason: "Needs a server" },
  { id: "sign-invite", group: "security-signature", name: "Email signature invitations", reason: "Needs email delivery" },
  { id: "sign-tracking", group: "security-signature", name: "Signature tracking and reminders", reason: "Needs a server" },
  { id: "timestamp", group: "security-signature", name: "Trusted timestamping", reason: "Needs a timestamp authority" },
  { id: "cert-verify", group: "security-signature", name: "Certificate verification", reason: "Trust chain validation" },
  { id: "redaction", group: "security-signature", name: "Permanent PDF redaction", reason: "Must remove content safely; not verified" },
  { id: "form-builder", group: "security-signature", name: "Interactive PDF form creation", reason: "Complex" },
  { id: "pdf-encrypt", group: "security-signature", name: "PDF encryption/decryption", reason: "Needs an engine not yet verified in-browser" },

  { id: "heic", group: "image-advanced", name: "HEIC/HEIF workflows", reason: "Codec licensing and size" },
  { id: "psd", group: "image-advanced", name: "PSD processing", reason: "Complex format" },
  { id: "raw", group: "image-advanced", name: "Camera RAW processing", reason: "Many proprietary formats" },
  { id: "tiff", group: "image-advanced", name: "Advanced TIFF processing", reason: "Not decodable by browsers" },
  { id: "gif-edit", group: "image-advanced", name: "Animated GIF editing", reason: "Frame decoding and re-encoding" },
  { id: "color-profiles", group: "image-advanced", name: "Color-profile conversion", reason: "Needs a color engine" },
  { id: "bulk-server", group: "image-advanced", name: "High-volume server processing", reason: "Needs a server" },

  { id: "cloud-processing", group: "cloud", name: "Cloud file processing", reason: "Needs a server" },
  { id: "server-jobs", group: "cloud", name: "Background server jobs", reason: "Needs a server" },
  { id: "remote-api", group: "cloud", name: "Remote API processing", reason: "Needs a server" },
  { id: "cloud-storage", group: "cloud", name: "Cloud storage integration", reason: "Third-party connections" },
  { id: "gpu", group: "cloud", name: "GPU inference", reason: "Paid infrastructure" },
  { id: "cross-device", group: "cloud", name: "Cross-device job persistence", reason: "Needs accounts and storage" },
];
