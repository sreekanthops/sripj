const router = require('express').Router();
const { verifyToken } = require('../auth');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// Primary model — strong free model; fallback if rate-limited
const PRIMARY_MODEL  = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const FALLBACK_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

async function callOpenRouter(model, text) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://my-journal-app',
      'X-Title':       'My Journal',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a grammar-correction assistant. ' +
            'When given text, return ONLY the corrected version with proper grammar and spelling. ' +
            'Do not add any explanation, commentary, bullet points, or markdown. ' +
            'Output only the corrected text as plain prose.',
        },
        { role: 'user', content: text.trim() },
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
