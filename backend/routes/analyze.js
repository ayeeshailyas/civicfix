const express = require("express");
const multer = require("multer");
const { analyzeImage } = require("../utils/openrouter");

const router = express.Router();

// Keep uploads in memory - we only need the bytes long enough to base64 them
// and send to OpenRouter. Nothing is written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are accepted."));
    }
    cb(null, true);
  },
});

function generateComplaintId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CF-${y}${m}${d}-${rand}`;
}

function buildLocalFallbackAnalysis({ description, location }) {
  const text = `${description || ""} ${location || ""}`.toLowerCase();

  let category = "Other";
  let department = "Municipal Complaint Cell";

  if (/pothole|road|street|asphalt|footpath/.test(text)) {
    category = "Road Damage";
    department = "Roads & Infrastructure Department";
  } else if (/garbage|trash|waste|bin|sanitation/.test(text)) {
    category = "Garbage & Sanitation";
    department = "Solid Waste Management Department";
  } else if (/streetlight|light|electric|pole/.test(text)) {
    category = "Streetlight & Electrical";
    department = "Electrical Maintenance Department";
  } else if (/drain|sewer|water|flood|leak/.test(text)) {
    category = "Water & Drainage";
    department = "Water & Drainage Department";
  }

  const severity = /blocked|danger|accident|injury|unsafe|collapsed|deep/.test(text)
    ? "High"
    : "Medium";

  const titleByCategory = {
    "Road Damage": "Damaged road surface needs urgent repair",
    "Garbage & Sanitation": "Garbage disposal and sanitation issue",
    "Streetlight & Electrical": "Non-functional streetlight in public area",
    "Water & Drainage": "Drainage or water infrastructure issue",
    Other: "Public infrastructure issue requires attention",
  };

  const shortTitle = titleByCategory[category] || titleByCategory.Other;

  const locationText = location || "[Nearest Landmark / Full Address]";
  const detailText =
    description ||
    "The issue is affecting residents and requires municipal inspection.";

  return {
    issue_detected: true,
    category,
    short_title: shortTitle,
    severity,
    severity_reason:
      severity === "High"
        ? "The reported condition appears to create a significant public safety and access risk."
        : "The issue appears to affect public convenience and should be addressed promptly.",
    department,
    department_reason:
      "This department is typically responsible for inspection, maintenance, and repairs in this category.",
    tags: ["civic-issue", "public-safety", "needs-inspection", "municipal-service"],
    complaint_letter: {
      subject: `Formal Complaint: ${shortTitle}`,
      body:
        `To,\n${department}\n\n` +
        `I am writing to formally report a public infrastructure issue at ${locationText}. ${detailText}\n\n` +
        "This matter is affecting daily movement and local residents, and it requires timely inspection and corrective action.\n\n" +
        "I request your office to register this complaint, conduct a site visit, and complete the required repairs at the earliest possible time.\n\n" +
        "Please share the complaint/reference number and expected resolution timeline.\n\n" +
        "Sincerely,\n[Your Name]\n[Your Contact]\n[Date]",
    },
    checklist: [
      "Confirm the exact spot and nearest landmark",
      "Attach clear photos from multiple angles",
      "Submit complaint to the relevant department",
      "Record the complaint/reference number",
      "Follow up after 7 working days if unresolved",
    ],
    fallback_used: true,
  };
}

router.post("/analyze", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image was uploaded." });
    }

    const base64 = req.file.buffer.toString("base64");
    const imageDataUrl = `data:${req.file.mimetype};base64,${base64}`;

    const { description, location } = req.body;

    const analysis = await analyzeImage({ imageDataUrl, description, location });

    res.json({
      complaint_id: generateComplaintId(),
      generated_at: new Date().toISOString(),
      ...analysis,
    });
  } catch (err) {
    if (/openrouter error/i.test(err?.message || "")) {
      console.warn("Using local fallback analysis:", err.message);
      const { description, location } = req.body;
      const analysis = buildLocalFallbackAnalysis({ description, location });

      return res.json({
        complaint_id: generateComplaintId(),
        generated_at: new Date().toISOString(),
        ...analysis,
      });
    }

    next(err);
  }
});

module.exports = router;
