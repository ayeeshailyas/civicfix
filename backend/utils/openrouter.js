const fetch = require("node-fetch");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// The instruction set the model must follow. Keeping this strict and
// example-driven makes the JSON reliable across different vision models.
const SYSTEM_PROMPT = `You are CivicFix AI, an assistant that helps citizens turn a photo of a broken public asset into a formal municipal complaint.

You will be given a photo of an infrastructure problem (road, garbage, streetlight, drainage, water supply, public property, etc.) plus optional notes from the citizen (location, description).

Study the image carefully and respond with ONLY a single valid JSON object (no markdown fences, no commentary before or after). Use exactly this shape:

{
  "issue_detected": true,
  "category": "Road Damage" | "Garbage & Sanitation" | "Streetlight & Electrical" | "Water & Drainage" | "Public Property Damage" | "Other",
  "short_title": "5-8 word plain description of the issue",
  "severity": "Low" | "Medium" | "High" | "Critical",
  "severity_reason": "1-2 plain sentences on why this severity level, referencing what is visible",
  "department": "the most likely municipal department/authority responsible, plain name e.g. 'Roads & Infrastructure Department' or 'Solid Waste Management Department'",
  "department_reason": "1 sentence on why this department handles it",
  "tags": ["4 to 6 short lowercase-hyphenated tags, e.g. pothole, road-safety, high-traffic-area"],
  "complaint_letter": {
    "subject": "formal complaint subject line",
    "body": "a complete, formal complaint letter body, 4-6 short paragraphs, written as if from a resident to the relevant department. Include placeholders in square brackets for info you don't have, like [Your Name], [Your Address/CNIC], [Nearest Landmark], [Date]. Reference the visible damage specifically. Professional, respectful, and firm tone."
  },
  "checklist": ["4 to 6 short actionable steps the citizen should take, in order, e.g. 'Note the exact location and a nearby landmark', 'Submit this letter to the department's helpline or complaint portal', 'Save the complaint/reference number once issued', 'Follow up after 7 working days if no response'"]
}

If the image does NOT clearly show a municipal infrastructure problem, set "issue_detected" to false, still fill every other field with your best honest reasonable guess or an empty string/array, and make "short_title" explain what you see instead.

Never wrap the JSON in markdown code fences. Never add text outside the JSON object.`;

/**
 * Calls the OpenRouter chat completions endpoint with an image + optional
 * citizen notes, and returns the parsed JSON analysis object.
 *
 * @param {Object} params
 * @param {string} params.imageDataUrl - "data:image/jpeg;base64,...."
 * @param {string} [params.description] - optional citizen-written description
 * @param {string} [params.location] - optional location/landmark text
 * @returns {Promise<Object>} parsed analysis JSON
 */
async function analyzeImage({ imageDataUrl, description, location }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Add it to backend/.env (see .env.example)."
    );
  }

  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";
  const fallbackModel =
    process.env.OPENROUTER_FALLBACK_MODEL || "qwen/qwen2.5-vl-72b-instruct:free";
  const freeFallbackModels = (
    process.env.OPENROUTER_FREE_FALLBACK_MODELS ||
    "google/gemini-2.0-flash-exp:free,qwen/qwen2.5-vl-72b-instruct:free,meta-llama/llama-3.2-11b-vision-instruct:free"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const candidateModels = [...new Set([model, fallbackModel, ...freeFallbackModels])];

  const userNotes = [
    description ? `Citizen's description: ${description}` : null,
    location ? `Location / landmark: ${location}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userContent = [
    {
      type: "text",
      text:
        userNotes ||
        "No extra notes were provided by the citizen. Analyze the photo alone.",
    },
    {
      type: "image_url",
      image_url: { url: imageDataUrl },
    },
  ];

  let lastErr = "";

  for (let i = 0; i < candidateModels.length; i += 1) {
    const attemptModel = candidateModels[i];
    const response = await callOpenRouter({
      apiKey,
      model: attemptModel,
      userContent,
    });

    if (response.ok) {
      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content;
      if (!raw) {
        throw new Error("OpenRouter returned no content.");
      }

      return parseModelJson(raw);
    }

    const errText = await response.text();
    lastErr = `model=${attemptModel} status=${response.status} body=${errText}`;

    const isInsufficientCredits =
      response.status === 402 && /insufficient credits/i.test(errText);
    const isModelUnavailable = response.status === 404;
    const isRateLimited = response.status === 429;

    const hasAnotherModel = i < candidateModels.length - 1;
    if (hasAnotherModel && (isInsufficientCredits || isModelUnavailable || isRateLimited)) {
      console.warn(
        `[OpenRouter] Switching model after ${response.status}: ${attemptModel} -> ${candidateModels[i + 1]}`
      );
      continue;
    }

    throw new Error(`OpenRouter error (${response.status}): ${errText}`);
  }

  throw new Error(`OpenRouter failed after trying models. Last error: ${lastErr}`);
}

async function callOpenRouter({ apiKey, model, userContent }) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // Optional but recommended by OpenRouter for analytics/rate limits
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:5000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "CivicFix",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
      max_tokens: 1400,
    }),
  });

  console.log(
    `[OpenRouter] model=${model} status=${response.status} ${response.statusText || ""}`.trim()
  );

  return response;
}

/**
 * Models sometimes wrap JSON in ```json fences despite instructions.
 * This strips fences and grabs the first {...} block as a safety net.
 */
function parseModelJson(raw) {
  let text = raw.trim();

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const slice = text.slice(firstBrace, lastBrace + 1);
      return JSON.parse(slice);
    }
    throw new Error("Could not parse a JSON object out of the model's response.");
  }
}

module.exports = { analyzeImage };
