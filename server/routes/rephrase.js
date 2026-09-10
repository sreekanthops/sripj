const router = require('express').Router();
const { verifyToken } = require('../auth');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// Fast, cheap models — llama-3.1-8b responds in ~1s
const PRIMARY_MODEL  = 'meta-llama/llama-3.1-8b-instruct';
const FALLBACK_MODEL = 'meta-llama/llama-3.3-70b-instruct';

const SYSTEM_PROMPT =
  'Fix the grammar and spelling of the text the user sends. ' +
  'Return ONLY the corrected text. No explanations, no bullet points, no markdown.';

async function callOpenRouter(model, text) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://my-journal-app',
      'X-Title':       'Unsent Stories',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: text.trim() },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Surface rate-limit so caller can try fallback
    const status = err?.error?.code || res.status;
    throw Object.assign(new Error(err?.error?.message || `HTTP ${res.status}`), { status });
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

// POST /api/rephrase  — grammar-correct a note body using OpenRouter
router.post('/', verifyToken, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  }

  try {
    let rephrased;
    try {
      rephrased = await callOpenRouter(PRIMARY_MODEL, text);
    } catch (e) {
      // If rate-limited on primary, try fallback model
      if (e.status === 429) {
        rephrased = await callOpenRouter(FALLBACK_MODEL, text);
      } else {
        throw e;
      }
    }
    res.json({ rephrased });
  } catch (err) {
    res.status(502).json({ error: 'Rephrase failed: ' + err.message });
  }
});

module.exports = router;
