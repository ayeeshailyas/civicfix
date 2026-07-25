require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const analyzeRouter = require("./routes/analyze");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(
      `[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`
    );
  });
  next();
});

// API routes
app.use("/api", analyzeRouter);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-nano-12b-v2-vl:free",
  });
});

// Serve the frontend (plain HTML/CSS/JS) from ../frontend so the whole
// app runs on a single port with zero CORS headaches.
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.use((err, req, res, next) => {
  const message = err?.message || "Unknown error";
  if (/openrouter/i.test(message)) {
    console.error("[OpenRouter] Error:", message);
    return res.status(200).json({
      error: true,
      message: "OpenRouter Error: " + message,
    });
  }

  console.error("Unhandled server error:", message);
  return res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`CivicFix server running at http://localhost:${PORT}`);
});
