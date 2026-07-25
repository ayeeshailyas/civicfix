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

function buildEnglishComplaintLetter({ category, department, location }) {
  const locationText = location || "[Nearest Landmark / Full Address]";

  const issueSummary =
    category === "Road Damage"
      ? "The reported road damage is creating a safety concern for pedestrians and vehicles."
      : category === "Garbage & Sanitation"
        ? "The reported waste condition is affecting cleanliness and public hygiene in the area."
        : category === "Streetlight & Electrical"
          ? "The reported lighting issue is reducing visibility and creating a safety risk after dark."
          : category === "Water & Drainage"
            ? "The reported water or drainage issue is affecting movement and may worsen if not repaired soon."
            : "The reported issue is affecting residents and requires municipal inspection.";

  const subject = `Formal Complaint: ${
    category === "Road Damage"
      ? "Damaged Road Surface Requires Urgent Repair"
      : category === "Garbage & Sanitation"
        ? "Garbage and Sanitation Issue Requires Attention"
        : category === "Streetlight & Electrical"
          ? "Streetlight / Electrical Issue Requires Repair"
          : category === "Water & Drainage"
            ? "Water / Drainage Issue Requires Immediate Action"
            : "Public Infrastructure Issue Requires Attention"
  }`;

  const body =
    `To,\n${department}\n\n` +
    `I am writing to formally report a public infrastructure issue at ${locationText}. ${issueSummary}\n\n` +
    "The issue has been observed for some time and is affecting daily movement and local residents. It requires timely inspection and corrective action.\n\n" +
    "I request your office to register this complaint, conduct a site visit, and complete the required repairs at the earliest possible time.\n\n" +
    "Please share the complaint/reference number and expected resolution timeline.\n\n" +
    "Sincerely,\n[Your Name]\n[Your Contact]\n[Date]";

  return { subject, body };
}

function fallbackEnglishLocation(location, description) {
  const firstSentence = String(location || "")
    .split(/[.!?]/)[0]
    .replace(/\s+/g, " ")
    .trim();
  const sourceText = `${location || ""} ${description || ""}`;
  const openForYears = sourceText.match(
    /\b(?:ye\s+)?(\d+)\s+saal\s+se\s+(?:khula|khuli)\s+(?:hoa|hui|hai|ha)\b/i
  );

  // Keep a plainly named landmark, but never copy a Roman Urdu sentence into
  // an English complaint when the AI service is unavailable.
  const romanUrduWords = /\b(ye|hai|ha|hain|se|ka|ki|ke|mein|main|ko|aur|par|khula|khuli|hoa|ho|saal|masla|ganda|toota|band|nahi|nahin)\b/i;
  const landmark =
    firstSentence && !romanUrduWords.test(firstSentence)
      ? firstSentence
      : "[Nearest Landmark / Full Address]";

  return openForYears
    ? `${landmark}, where the reported issue has remained open for ${openForYears[1]} years`
    : landmark;
}

function classifyDepartment(analysis, sourceText) {
  const text = `${sourceText} ${analysis.short_title || ""} ${analysis.department || ""} ${analysis.department_reason || ""} ${(analysis.tags || []).join(" ")}`.toLowerCase();

  if (/\b(transformer|electric pole|utility pole|live wire|power meter|high-voltage|blackout|power outage|electrical fire|sparks?)\b/.test(text)) {
    return "Electricity / Power Department";
  }
  if (
    analysis.category === "Water & Drainage" ||
    /\b(wasa|water supply|water drainage|water department|sewage|sewer|water leak|water leakage|water main|pipe(?:line)?|open manhole|drainage blockage|blocked drain)\b/.test(text)
  ) {
    return "WASA / Water Supply";
  }
  if (["Road Damage", "Garbage & Sanitation", "Streetlight & Electrical"].includes(analysis.category)) {
    return "Municipal Corporation";
  }
  if (["Electricity / Power Department", "WASA / Water Supply"].includes(analysis.department)) {
    return analysis.department;
  }
  return "Municipal Corporation";
}

function normalizeSeverity(analysis, sourceText) {
  const text = `${sourceText} ${analysis.short_title || ""} ${analysis.severity_reason || ""} ${(analysis.tags || []).join(" ")}`.toLowerCase();
  const severity = String(analysis.severity || "Medium").toLowerCase();

  if (/\b(fire|flames|smoke|live wire)\b/.test(text) || severity === "critical") {
    return "Critical";
  }
  if (/\b(sparks?|immediate hazard)\b/.test(text) || severity === "high") {
    return "High";
  }
  return severity === "low" ? "Low" : "Medium";
}

function normalizeAnalysis(analysis, { description = "", location = "" } = {}) {
  const category = analysis.category || "Other";
  const sourceText = `${description} ${location}`;
  const department = classifyDepartment(analysis, sourceText);
  const severity = normalizeSeverity(analysis, sourceText);
  const englishLocation = analysis.english_location_summary || "[Nearest Landmark / Full Address]";
  const complaint_letter = buildEnglishComplaintLetter({
    category,
    department,
    location: englishLocation,
  });

  return {
    ...analysis,
    department,
    severity,
    complaint_letter,
  };
}

function buildLocalFallbackAnalysis({ description, location }) {
  const text = `${description || ""} ${location || ""}`.toLowerCase();

  let category = "Other";
  let department = "Municipal Corporation";

  if (/transformer|electric pole|utility pole|live wire|power meter|high-voltage|blackout|power outage|electrical fire|sparks?/.test(text)) {
    category = "Streetlight & Electrical";
    department = "Electricity / Power Department";
  } else if (/pipe|water main|manhole|drain|sewer|water|flood|leak/.test(text)) {
    category = "Water & Drainage";
    department = "WASA / Water Supply";
  } else if (/pothole|road|street(?!\s*light)|asphalt|footpath/.test(text)) {
    category = "Road Damage";
    department = "Municipal Corporation";
  } else if (/garbage|trash|waste|bin|sanitation/.test(text)) {
    category = "Garbage & Sanitation";
    department = "Municipal Corporation";
  } else if (/streetlight|street light/.test(text)) {
    category = "Streetlight & Electrical";
    department = "Municipal Corporation";
  }

  const severity = /fire|flames|smoke|live wire/.test(text)
    ? "Critical"
    : /sparks?|immediate hazard|blocked|danger|accident|injury|unsafe|collapsed|deep/.test(text)
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

  const complaint_letter = buildEnglishComplaintLetter({
    category,
    department,
    location: fallbackEnglishLocation(location, description),
  });

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
    english_location_summary: fallbackEnglishLocation(location, description),
    tags: ["civic-issue", "public-safety", "needs-inspection", "municipal-service"],
    complaint_letter,
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
    const normalizedAnalysis = normalizeAnalysis(analysis, { description, location });

    res.json({
      complaint_id: generateComplaintId(),
      generated_at: new Date().toISOString(),
      ...normalizedAnalysis,
    });
  } catch (err) {
    if (/openrouter error/i.test(err?.message || "")) {
      console.warn("Using local fallback analysis:", err.message);
      const { description, location } = req.body;
      const analysis = buildLocalFallbackAnalysis({ description, location });
      const normalizedAnalysis = normalizeAnalysis(analysis, { description, location });

      return res.json({
        complaint_id: generateComplaintId(),
        generated_at: new Date().toISOString(),
        ...normalizedAnalysis,
      });
    }

    next(err);
  }
});

module.exports = router;
