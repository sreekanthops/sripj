/**
 * AI content moderation via OpenRouter.
 * Used before any note is published to the public feed.
 *
 * Returns: { allowed: bool, reason: string }
 *   allowed = true  → content is safe to publish
 *   allowed = false → content violates policy; reason explains why
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODERATION_MODEL   = 'meta-llama/llama-3.1-8b-instruct';

const SYSTEM_PROMPT = `You are a strict content moderation AI for a public diary platform.
Your job is to decide if a piece of user-written content is safe to publish publicly.

Reject (respond REJECT) if the content contains ANY of the following:
- Nudity, sexual content, or explicit sexual language
- Graphic violence, gore, or instructions for self-harm / harm to others
- Hate speech, slurs, or content targeting people by race, religion, gender, sexuality, disability, or nationality
- Threats, harassment, or targeted abuse
- Content that sexualises or exploits minors (CSAM) in any form
- Spam or scam content (fake giveaways, phishing links, etc.)

Allow (respond ALLOW) everything else, including:
- Emotional diary entries (sadness, heartbreak, loneliness, anger, grief)
- Mental health writing, anxiety, depression described in a non-harmful way
- Strong opinions, rants, complaints — even about sensitive topics — if not hateful
- Mature themes described tastefully (relationships, loss, trauma recovery)
- Any language as long as it doesn't violate the above

Your response MUST be EXACTLY one line in this format:
ALLOW
or
REJECT: <short reason in under 15 words>

No other text.`;

async function moderateText(title, body) {
  if (!OPENROUTER_API_KEY) {
    // No key configured — allow everything (fail open)
    return { allowed: true, reason: '' };
  }

  const content = [title, body].filter(Boolean).join('\n\n').slice(0, 4000);
  if (!content.trim()) return { allowed: true, reason: '' };

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://unsentstories.in',
        'X-Title':      'Unsent Stories Moderation',
      },
      body: JSON.stringify({
        model:      MODERATION_MODEL,
        max_tokens: 60,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: `Moderate this diary entry:\n\n${content}` },
        ],
      }),
    });

    if (!res.ok) {
      console.error('[moderation] API error', res.status);
      return { allowed: true, reason: '' }; // fail open on API error
    }

    const data   = await res.json();
    const reply  = (data.choices?.[0]?.message?.content || '').trim().toUpperCase();

    if (reply.startsWith('REJECT')) {
      const reason = reply.replace(/^REJECT[:\s]*/i, '').trim() || 'Content violates community guidelines';
      return { allowed: false, reason };
    }
    return { allowed: true, reason: '' };

  } catch (err) {
    console.error('[moderation] fetch failed:', err.message);
    return { allowed: true, reason: '' }; // fail open on network error
  }
}

/**
 * Moderate a chat message body.
 * Lighter check — only hard rejects (nudity, CSAM, threats).
 */
async function moderateMessage(text) {
  if (!OPENROUTER_API_KEY || !text?.trim()) return { allowed: true, reason: '' };

  const MSG_PROMPT = `You are a chat moderation AI. Reject ONLY if the message contains:
- Explicit nudity or sexual content
- CSAM or content sexualising minors
- Direct threats of violence or death
- Hate speech with slurs

Respond EXACTLY with ALLOW or REJECT: <short reason>. No other text.`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://unsentstories.in',
        'X-Title':      'Unsent Stories Moderation',
      },
      body: JSON.stringify({
        model:      MODERATION_MODEL,
        max_tokens: 40,
        temperature: 0,
        messages: [
          { role: 'system', content: MSG_PROMPT },
          { role: 'user',   content: text.slice(0, 1000) },
        ],
      }),
    });
    if (!res.ok) return { allowed: true, reason: '' };
    const data  = await res.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim().toUpperCase();
    if (reply.startsWith('REJECT')) {
      const reason = reply.replace(/^REJECT[:\s]*/i, '').trim() || 'Message violates guidelines';
      return { allowed: false, reason };
    }
    return { allowed: true, reason: '' };
  } catch {
    return { allowed: true, reason: '' };
  }
}

module.exports = { moderateText, moderateMessage };
