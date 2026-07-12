module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { q } = req.query;
  if (!q) {
    res.status(400).json({ error: 'Missing search query q' });
    return;
  }

  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned status ${response.status}`);
    }

    const html = await response.text();
    const results = [];
    const parts = html.split('class="result results_links');
    
    for (let i = 1; i < Math.min(parts.length, 6); i++) {
      const part = parts[i];
      const aMatch = part.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = part.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

      if (aMatch) {
        let link = aMatch[1];
        if (link.includes('uddg=')) {
          const uMatch = link.match(/uddg=([^&]+)/);
          if (uMatch) link = decodeURIComponent(uMatch[1]);
        }
        if (link.startsWith('//')) link = 'https:' + link;
        
        const title = aMatch[2].replace(/<[^>]*>/g, '').trim();
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
        
        results.push({ title, link, snippet });
      }
    }

    res.status(200).json({ results });
  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
};
