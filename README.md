# CivicFix — AI Municipal Complaint & Infrastructure Reporter

Upload a photo of a broken road, an overflowing bin, or a dead streetlight.
CivicFix classifies the severity, identifies the likely municipal department,
drafts a formal complaint letter, and gives you a civic action checklist —
all in one request, powered by a vision model via OpenRouter.

## Stack

- **Backend:** Node.js + Express (single server, no separate frontend server needed)
- **Frontend:** Plain HTML / CSS / JS — no framework, no build step
- **AI:** OpenRouter API, using a vision-capable model (`google/gemini-2.5-flash` by default)

## Project structure

```
civicfix/
├── backend/
│   ├── routes/analyze.js      # POST /api/analyze
│   ├── utils/openrouter.js    # calls OpenRouter + parses the JSON response
│   ├── server.js              # Express app entry point
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── index.html
    ├── style.css
    └── script.js
```

The Express server serves the `frontend/` folder as static files AND the
`/api/*` routes, so you only run **one** server on **one** port — no CORS
setup needed.

---

## Step-by-step setup

### 1. Install Node.js

You need Node.js 18 or newer. Check with:

```bash
node -v
```

If you don't have it, download it from https://nodejs.org (LTS version).

### 2. Get an OpenRouter API key

1. Go to https://openrouter.ai and sign up.
2. Go to https://openrouter.ai/keys and create a key.
3. Add a small amount of credit to your account (both Gemini 2.5 Flash and
   Qwen VL models are very cheap per request).

### 3. Install backend dependencies

```bash
cd civicfix/backend
npm install
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and paste your key:

```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
OPENROUTER_MODEL=google/gemini-2.5-flash
PORT=5000
```

**Important note on the model choice:** you mentioned
`qwen/qwen-2.5-72b-instruct` — that particular model is **text-only**, it
cannot read images, so it won't work for this app. If you want to use Qwen,
use the vision variant instead: `qwen/qwen2.5-vl-72b-instruct`. Both
`google/gemini-2.5-flash` and `qwen/qwen2.5-vl-72b-instruct` work as drop-in
replacements — just change `OPENROUTER_MODEL` in `.env`.

### 5. Run the server

```bash
npm start
```

You should see:

```
CivicFix server running at http://localhost:5000
```

### 6. Open the app

Go to **http://localhost:5000** in your browser. Upload a photo, optionally
add a location and description, and click "Analyze & draft complaint".

---

## How it works

1. The browser sends the photo (+ optional notes) to `POST /api/analyze` as
   `multipart/form-data`.
2. The backend converts the image to a base64 data URL and sends it to
   OpenRouter's chat completions endpoint, along with a system prompt that
   forces the model to answer with a strict JSON object (severity, category,
   department, complaint letter, tags, checklist).
3. The backend generates a complaint reference ID (e.g. `CF-20260724-4821`)
   and returns everything to the frontend.
4. The frontend renders it as a "complaint ticket" card, with buttons to
   copy or download the letter as a `.txt` file.

## Customizing

- **Change the AI's tone / letter format:** edit `SYSTEM_PROMPT` in
  `backend/utils/openrouter.js`.
- **Add more categories/severities:** update the prompt's enum lists in the
  same file, and add matching CSS classes (`.sev-low`, `.sev-medium`, etc.)
  in `frontend/style.css` if you add new severity levels.
- **Deploy:** the backend can be deployed as-is to Render, Railway, Fly.io,
  or a VPS. Just set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` as
  environment variables on the host — nothing else changes since the
  frontend is served by the same Express app.

## Troubleshooting

- **"OPENROUTER_API_KEY is missing"** — you didn't create `.env`, or forgot
  to paste the key in it. Restart the server after editing `.env`.
- **"OpenRouter error (401)"** — your API key is wrong or has no credit.
- **"Could not parse a JSON object out of the model's response"** — rare,
  happens if the model adds stray text. Try again, or switch
  `OPENROUTER_MODEL` to the other supported model.
- **Nothing happens on submit** — open the browser console (F12) and check
  for errors; make sure the server is running and you're on
  `http://localhost:5000` (not opening `index.html` directly as a file).
