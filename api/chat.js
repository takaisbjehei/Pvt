module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { model, messages, temperature, max_tokens, stream } = req.body;
  if (!messages) {
    res.status(400).json({ error: 'Missing messages payload.' });
    return;
  }

  // Retrieve keys from Vercel environment variables
  const rawKeys = process.env.GROQ_KEYS || '';
  const keys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);

  if (keys.length === 0) {
    res.status(500).json({ error: 'GROQ_KEYS environment variable is missing or empty.' });
    return;
  }

  let attempt = 0;
  let keyIndex = Math.floor(Math.random() * keys.length);

  while (attempt < keys.length * 2) {
    const currentKey = keys[keyIndex];
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentKey}`
        },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages,
          temperature: temperature !== undefined ? parseFloat(temperature) : 0.85,
          max_tokens: max_tokens ? parseInt(max_tokens) : 450,
          stream: stream ? true : false
        })
      });

      if (response.status === 429) {
        throw new Error('RateLimit');
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`APIError: ${errText}`);
      }

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
        return;
      } else {
        const data = await response.json();
        res.status(200).json(data);
        return;
      }
    } catch (err) {
      console.error(`Groq endpoint attempt ${attempt} failed (Index ${keyIndex}): ${err.message}`);
      keyIndex = (keyIndex + 1) % keys.length;
      attempt++;
      // Backoff delay
      await new Promise(r => setTimeout(r, Math.min(200 * attempt, 1000)));
    }
  }

  res.status(500).json({ error: 'All configured keys failed or were rate-limited.' });
};
