module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { avatar_url, name, persona } = req.body;
  
  const rawKeys = process.env.GROQ_KEYS || '';
  const keys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);

  if (keys.length === 0) {
    res.status(500).json({ error: 'GROQ_KEYS environment variable is missing.' });
    return;
  }

  let attempt = 0;
  let keyIndex = Math.floor(Math.random() * keys.length);

  while (attempt < keys.length * 2) {
    const currentKey = keys[keyIndex];
    try {
      let messages = [];
      let model = 'llama-3.3-70b-versatile';
      
      // If we have a base64 image URL, use the vision model!
      if (avatar_url && avatar_url.startsWith('data:image/')) {
        model = 'llama-3.2-11b-vision-preview';
        messages = [
          {
            role: 'user',
            content: [
              { type: 'text', text: `Analyze the avatar image of this roleplay character named "${name || 'AI'}". Write a concise, 1-sentence physical description of their face, hair, eyes, and clothing style to be used as a prompt prefix for an image generator (e.g. 'A 20-year-old female with long black hair, green eyes, wearing a leather jacket'). Keep it under 25 words.` },
              { type: 'image_url', image_url: { url: avatar_url } }
            ]
          }
        ];
      } else {
        // Fallback to text analysis of their persona
        messages = [
          {
            role: 'system',
            content: 'You are an assistant that extracts physical descriptions. Given a character name and their persona, output a concise 1-sentence physical description (e.g. "a 20-year-old girl with blue eyes and blonde hair") to be used as a prompt for an image generator. Output only the description under 20 words.'
          },
          {
            role: 'user',
            content: `Name: ${name || 'AI'}\nPersona: ${persona || 'None'}`
          }
        ];
      }

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 60
        })
      });

      if (response.status === 429) {
        throw new Error('RateLimit');
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`APIError: ${errText}`);
      }

      const data = await response.json();
      const description = data.choices[0].message.content.trim();
      res.status(200).json({ description });
      return;
    } catch (err) {
      console.error(`Describe avatar attempt ${attempt} failed: ${err.message}`);
      keyIndex = (keyIndex + 1) % keys.length;
      attempt++;
      await new Promise(r => setTimeout(r, 200 * attempt));
    }
  }

  res.status(500).json({ error: 'All configured keys failed.' });
};
