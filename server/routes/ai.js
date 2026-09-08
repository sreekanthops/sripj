const router = require('express').Router();
const { verifyToken } = require('../auth');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const PRIMARY_MODEL  = 'meta-llama/llama-3.1-8b-instruct';
const FALLBACK_MODEL = 'meta-llama/llama-3.3-70b-instruct';

async function callOpenRouter(model, systemPrompt, userText) {
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
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userText.trim() },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = err?.error?.code || res.status;
    throw Object.assign(new Error(err?.error?.message || `HTTP ${res.status}`), { status });
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

// POST /api/ai/expand
//   Body: { text, words? }
//   text  — what the user has written so far (seed / prompt)
//   words — approximate target word count for the generated text (default 80)
//   Returns: { result }  — AI-generated diary entry text based on the seed
router.post('/expand', verifyToken, async (req, res) => {
  const { text, words = 80 } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  }

  const targetWords = Math.min(Math.max(Number(words) || 80, 20), 400);

  const systemPrompt =
    `You are a thoughtful diary-writing assistant. ` +
    `The user gives you a short note, idea, or keyword as a seed. ` +
    `Expand it into a warm, personal diary entry in first-person voice. ` +
    `Write approximately ${targetWords} words. ` +
    `Keep the tone authentic and reflective, matching the mood of the seed. ` +
    `Return ONLY the diary text — no titles, no labels, no markdown formatting.`;

  try {
    let result;
    try {
      result = await callOpenRouter(PRIMARY_MODEL, systemPrompt, text);
    } catch (e) {
      if (e.status === 429) {
        result = await callOpenRouter(FALLBACK_MODEL, systemPrompt, text);
      } else {
        throw e;
      }
    }
    res.json({ result });
  } catch (err) {
    res.status(502).json({ error: 'AI expand failed: ' + err.message });
  }
});

module.exports = router;
