const OPENAI_URL = "https://api.openai.com/v1/responses";

function buildSystemPrompt() {
  return [
    "Tu es un assistant linguistique professionnel.",
    "Retourne uniquement du JSON valide au format impose.",
    "Ne jamais ajouter de texte hors JSON."
  ].join(" ");
}

function buildUserPrompt({ mode, language, text }) {
  return JSON.stringify({
    instruction:
      "Corrige ou reformule selon le mode. Ne renvoie que le JSON strict attendu avec corrected_text, confidence_score, changes_explained.",
    mode,
    language,
    text,
    output_schema: {
      corrected_text: "string",
      confidence_score: "number",
      changes_explained: [
        {
          original: "string",
          corrected: "string",
          type: "orthographe|grammaire|syntaxe|style|clarte|ton"
        }
      ]
    }
  });
}

function extractJsonCandidate(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return null;
}

function validateResponseShape(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof data.corrected_text !== "string") return false;
  if (typeof data.confidence_score !== "number") return false;
  if (!Array.isArray(data.changes_explained)) return false;
  return true;
}

function localFallbackCorrection({ mode, text }) {
  let corrected = text;

  const replacements = [
    [/\bsa va\b/gi, "ca va"],
    [/\bca\b/gi, "ca"],
    [/\bteh\b/gi, "the"],
    [/\brecu\b/gi, "recu"],
    [/\bprobleme\b/gi, "probleme"]
  ];

  for (const [pattern, next] of replacements) {
    corrected = corrected.replace(pattern, next);
  }

  if (mode === "MODE_CLARITY") {
    corrected = corrected.replace(/\s{2,}/g, " ").trim();
  }

  const changed = corrected !== text;

  return {
    corrected_text: corrected,
    confidence_score: changed ? 0.78 : 0.95,
    changes_explained: changed
      ? [{ original: text, corrected, type: "orthographe" }]
      : []
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function correctWithOpenAI({ mode, language, text }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    return localFallbackCorrection({ mode, text });
  }

  const body = {
    model,
    temperature: 0,
    input: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt({ mode, language, text }) }
    ]
  };

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        OPENAI_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(body)
        },
        20000
      );

      if (!response.ok) {
        const errBody = await safeJson(response);
        const err = new Error(errBody?.error?.message || `OpenAI error ${response.status}`);
        err.status = response.status;
        throw err;
      }

      const payload = await response.json();
      const textOut = extractOutputText(payload);
      const candidate = extractJsonCandidate(textOut);
      if (!candidate) {
        const err = new Error("Model did not return JSON");
        err.status = 502;
        throw err;
      }

      const parsed = JSON.parse(candidate);
      if (!validateResponseShape(parsed)) {
        const err = new Error("Invalid JSON shape");
        err.status = 502;
        throw err;
      }

      return parsed;
    } catch (error) {
      lastError = error;
      const retryable = !error.status || error.status >= 500 || error.name === "AbortError";
      if (!retryable || attempt === 1) {
        break;
      }
    }
  }

  if (lastError?.name === "AbortError") {
    const timeoutErr = new Error("OpenAI timeout");
    timeoutErr.status = 408;
    throw timeoutErr;
  }

  throw lastError;
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = data?.output || [];
  const texts = [];
  for (const item of chunks) {
    const parts = item?.content || [];
    for (const part of parts) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        texts.push(part.text);
      }
    }
  }
  return texts.join("\n").trim();
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
