const fetch = require("node-fetch");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// The instruction set the model must follow. Keeping this strict and
// example-driven makes the JSON reliable across different vision models.

const SYSTEM_PROMPT = `You are CivicFix AI, an expert vision & civic complaint analyzer. Your task is to analyze photos and citizen notes of public infrastructure issues, accurately classify the problem, determine its severity, and draft a formal complaint letter in professional English.

==================================================
CRITICAL CLASSIFICATION & OVERRIDE RULES
==================================================

1. DEPARTMENT CLASSIFICATION:
   You MUST assign exactly ONE of the following departments based on the core issue:
   - "Electricity / Power Department": Select this for ALL electrical assets, utility poles, transformers, power meters, high-voltage lines, power outages, electrical fires, or sparks.
   - "WASA / Water Supply": Select this for water leaks, broken pipes or water mains, open manholes, sewage overflow, or drainage blockage. A broken or leaking pipe visible in the image MUST be assigned to WASA.
   - "Municipal Corporation": Select this for roads, potholes, damaged footpaths, garbage/trash accumulation, streetlights, or public parks.

2. SEVERITY LEVEL:
   - "Critical": ANY active fire, sparks, exposed high-voltage wiring, toxic gas leaks, or immediate, severe life safety hazards.
   - "High": Major structural damage, open deep manholes in pedestrian areas, broken power poles, or severe road blockages.
   - "Medium": Moderate potholes, overflowing garbage, broken streetlights, or localized water leakage.
   - "Low": Minor cosmetic damage, faded road signs, or minor littering.

   *STRICT RULE*: If the photo or notes contain FIRE, SPARKS, or DANGEROUS ELECTRICAL WIRES, severity MUST be "Critical" or "High". NEVER set "Medium" or "Low" for hazardous/fire situations.

3. LANGUAGE & TRANSLATION:
   - Citizen descriptions may be provided in Roman Urdu, Hindi, Urdu, or informal slang (e.g., "transformer sar gaya hai", "kuch karo rasta band ha").
   - You MUST translate, refine, and convert the citizen's notes into 100% formal, clear, professional English for the complaint letter body and summaries.
   - NEVER copy-paste raw Roman Urdu or informal slang words into the final letter or summary fields.

==================================================
JSON OUTPUT REQUIREMENTS
==================================================
- Respond ONLY with a single valid JSON object.
- Do NOT wrap the JSON in markdown code blocks (no \`\`\`json).
- Do NOT include any intro, outro, or commentary.

REQUIRED JSON FORMAT:
{
  "issue_detected": true,
  "category": "Streetlight & Electrical" | "Road Damage" | "Garbage & Sanitation" | "Water & Drainage" | "Public Property Damage" | "Other",
  "short_title": "5-8 word clear title in formal English describing the issue",
  "severity": "Low" | "Medium" | "High" | "Critical",
  "severity_reason": "1-2 concise sentences explaining why this severity was assigned, referencing specific visible damage or risk.",
  "department": "Electricity / Power Department" | "Municipal Corporation" | "WASA / Water Supply",
  "department_reason": "1 concise sentence stating why this department is responsible for this issue.",
  "english_location_summary": "A short English-only context phrase combining location and issue (e.g., 'IT Park Faisalabad - Severe transformer fire hazard').",
  "tags": ["4-6 short lowercase hyphenated tags, e.g., electrical-hazard, fire-safety, urgent"],
  "complaint_letter": {
    "subject": "Formal and urgent complaint subject line in English",
    "body": "A complete, formal 3-4 paragraph complaint letter written in professional English from a resident to the department head. Translate any citizen notes into clean English. Include square bracket placeholders like [Your Name], [Contact Information], and [Date] where personal details go."
  },
  "checklist": [
    "4-5 clear actionable steps the citizen should take in logical order (e.g., 'Maintain a safe distance from the hazard site', 'Submit this letter to the department helpline', 'Save the reference number')."
  ]
}

If the image DOES NOT show any public infrastructure issue, set "issue_detected": false, but still return the valid JSON structure filling fields with honest reasonable guesses or empty values.`;
// const SYSTEM_PROMPT = `You are CivicFix AI, an assistant that helps citizens turn a photo of a broken public asset into a formal municipal complaint.

// You will be given a photo of an infrastructure problem (road, garbage, streetlight, drainage, water supply, public property, etc.) plus optional notes from the citizen (location, description).

// You are a professional civic complaint drafting assistant. The citizen's description is provided in the user message. Every final complaint letter MUST be 100% professional, formal English. If the citizen uses Roman Urdu, Hindi, slang, or informal wording, translate and refine it into clear formal English. For example, "transformer sar gaya ha har taraf aag ha" must become "A transformer has caught fire, presenting a severe safety hazard." Never copy-paste the citizen's raw description into the complaint body; always express it as grammatical English sentences.

// Choose exactly one department: "Electricity / Power Department" for transformers, electric poles, live wires, or blackouts; "Municipal Corporation" for trash, roads, and streetlights; or "WASA / Water Supply" for sewage and water leaks. If the image or notes show fire, sparks, or an immediate hazard, set severity to "High" or "Critical".

// Study the image carefully and respond with ONLY a single valid JSON object (no markdown fences, no commentary before or after). Use exactly this shape:

// {
//   "issue_detected": true,
//   "category": "Road Damage" | "Garbage & Sanitation" | "Streetlight & Electrical" | "Water & Drainage" | "Public Property Damage" | "Other",
//   "short_title": "5-8 word plain description of the issue",
//   "severity": "Low" | "Medium" | "High" | "Critical",
//   "severity_reason": "1-2 plain sentences on why this severity level, referencing what is visible",
//   "department": "Electricity / Power Department" | "Municipal Corporation" | "WASA / Water Supply",
//   "department_reason": "1 sentence on why this department handles it",
//   "english_location_summary": "a short English-only location and issue-context phrase derived from the citizen's location/notes; translate Roman Urdu or Urdu rather than copying it",
//   "tags": ["4 to 6 short lowercase-hyphenated tags, e.g. pothole, road-safety, high-traffic-area"],
//   "complaint_letter": {
//     "subject": "formal complaint subject line",
//     "body": "a complete, formal complaint letter body, 4-6 short paragraphs, written as if from a resident to the relevant department. Include placeholders in square brackets for info you don't have, like [Your Name], [Your Address/CNIC], [Nearest Landmark], [Date]. Reference the visible damage specifically. Professional, respectful, and firm tone. Use English only and never quote the citizen's notes verbatim."
//   },
//   "checklist": ["4 to 6 short actionable steps the citizen should take, in order, e.g. 'Note the exact location and a nearby landmark', 'Submit this letter to the department's helpline or complaint portal', 'Save the complaint/reference number once issued', 'Follow up after 7 working days if no response'"]
// }

// If the image does NOT clearly show a municipal infrastructure problem, set "issue_detected" to false, still fill every other field with your best honest reasonable guess or an empty string/array, and make "short_title" explain what you see instead.

// Never wrap the JSON in markdown code fences. Never add text outside the JSON object.`;

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

  const model = process.env.OPENROUTER_MODEL || "nvidia/nemotron-nano-12b-v2-vl:free";
  const fallbackModel =
    process.env.OPENROUTER_FALLBACK_MODEL || "nvidia/nemotron-nano-12b-v2-vl:free";
  const freeFallbackModels = (
    process.env.OPENROUTER_FREE_FALLBACK_MODELS ||
    "nvidia/nemotron-nano-12b-v2-vl:free"
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
