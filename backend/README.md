# InvoiceFlow AI — Backend Service

Node.js + Express + TypeScript backend service for InvoiceFlow AI, supporting multi-tenant AP invoice processing, deterministic math validation, 3-way PO matching, and resilient AI provider fallback (Gemini + Groq).

---

## 🌟 AI Provider Architecture (Gemini + Groq Fallback)

InvoiceFlow AI implements a resilient, multi-provider AI fallback pipeline:

```
                  Invoice / Query Request
                             │
                      AI Service Layer
                             │
                ┌────────────┴────────────┐
                │  Primary: Google Gemini │
                └────────────┬────────────┘
                             │
             Retryable Error (429 / RESOURCE_EXHAUSTED / 503)?
                             │ YES
                ┌────────────▼────────────┐
                │  Fallback: Groq (Llama) │
                └────────────┬────────────┘
                             │
                    Normalized Result
```

### Fallback Rules
1. **Normal Flow**: The system routes AI requests to **Google Gemini** (`GEMINI_API_KEY`).
2. **Provider Failure Handling**: If Gemini returns a retryable provider error (`HTTP 429`, `RESOURCE_EXHAUSTED`, `rate limit`, `HTTP 503`, or network timeout), the backend logs `[AI] Gemini unavailable/rate limited` and automatically falls back to **Groq** (`GROQ_API_KEY`).
3. **Non-Retryable Errors**: Application validation errors, invalid parameters, or client schema errors fail fast without calling Groq unnecessarily.

---

## 🔑 Required Environment Variables

Set the following variables in `backend/.env` (local) or Render Dashboard (production):

| Variable | Description | Example / Note |
| :--- | :--- | :--- |
| `PORT` | HTTP Server Port | `5001` (Set automatically by Render) |
| `NODE_ENV` | Environment Mode | `production` or `development` |
| `MONGODB_URI` | MongoDB Atlas Connection String | `mongodb+srv://...` |
| `JWT_SECRET` | Secret key for signing auth tokens | Bounded random string |
| `GEMINI_API_KEY` | Primary AI Provider Key | Google AI Studio Key |
| `GROQ_API_KEY` | Fallback AI Provider Key | Groq Console API Key |

---

## 🚀 Running Locally

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Run TypeScript compiler check
npx tsc --noEmit

# Build production bundle
npm run build

# Start development server
npm run dev

# Start compiled production build
npm start
```

---

## 🧪 Testing Provider Fallback

1. **Normal Operation Test**: With both `GEMINI_API_KEY` and `GROQ_API_KEY` set, upload an invoice or query Copilot. Check server logs:
   ```
   [AI] Trying Gemini (text_generation)...
   [AI] Gemini succeeded (gemini-2.5-flash)
   ```

2. **Fallback Simulation**: Temporarily set an invalid or exhausted `GEMINI_API_KEY` while keeping a valid `GROQ_API_KEY`. Submit a request:
   ```
   [AI] Trying Gemini (text_generation)...
   [AI] Gemini failed for text_generation: RESOURCE_EXHAUSTED
   [AI] Gemini unavailable/rate limited. Preparing fallback to Groq...
   [AI] Falling back to Groq (text_generation)...
   [AI] Groq succeeded (llama-3.3-70b-versatile)
   ```
