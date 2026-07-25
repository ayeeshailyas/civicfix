require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const analyzeRouter = require("./routes/analyze");

const app = express();
const PORT = process.env.PORT || 5000;

// Requests served by Vercel use the same origin. The callback also permits
// direct browser requests from the deployed Vercel hostname when applicable.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || /^https:\/\/[^/]+\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
  })
);
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

// Prefer Vercel's conventional public directory, while retaining the current
// local project layout for `npm start` development.
const publicPath = path.join(__dirname, "public");
const frontendPath = require("fs").existsSync(publicPath)
  ? publicPath
  : path.join(__dirname, "..", "frontend");
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

// Vercel imports the Express app; local development starts a listener.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CivicFix server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
