const router = require('express').Router();
const { verifyToken } = require('../auth');

const OLLAMA_URL  = process.env.OLLAMA_URL  || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'oxalpha';

// POST /api/rephrase  — grammar-correct a piece of text using Ollama oxalpha
router.post('/', verifyToken, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });

  const prompt =
    'Correct the grammar and spelling of the following text. ' +
    'Return only the corrected text with no explanations, no quotes, and no extra commentary.\n\n' +
    text.trim();

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(502).json({ error: `Ollama error: ${response.status} ${errText}` });
    }

    const data = await response.json();
    const rephrased = (data.response || '').trim();
    res.json({ rephrased });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Ollama: ' + err.message });
  }
});

module.exports = router;
