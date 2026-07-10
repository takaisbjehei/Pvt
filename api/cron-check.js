const webpush = require('web-push');

const SUPABASE_URL = 'https://yfrultgnyyerkuzsbmys.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmcnVsdGdueXllcmt1enNibXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjA2MjksImV4cCI6MjA5OTA5NjYyOX0.voolgNCMcrCKQo91dGP3CcmWJZgp2MTuI3oBE0ACeik';

module.exports = async (req, res) => {
  // Simple auth header check to secure vercel cron endpoint
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // 1. Fetch all AI characters
    const charRes = await fetch(`${SUPABASE_URL}/rest/v1/characters?select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const characters = await charRes.json();
    const charIds = new Set(characters.map(c => String(c.id)));

    // 2. Fetch recent messages (last 200)
    const msgRes = await fetch(`${SUPABASE_URL}/rest/v1/messages?select=*&order=created_at.desc&limit=200`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const messages = await msgRes.json();

    // Group messages by conversation: keys are "user:charId"
    const convos = {};
    for (const msg of messages) {
      const isSenderAi = charIds.has(String(msg.sender));
      const isReceiverAi = charIds.has(String(msg.receiver));

      if (isSenderAi && !isReceiverAi) {
        const key = `${msg.receiver}:${msg.sender}`;
        if (!convos[key]) convos[key] = [];
        convos[key].push(msg);
      } else if (!isSenderAi && isReceiverAi) {
        const key = `${msg.sender}:${msg.receiver}`;
        if (!convos[key]) convos[key] = [];
        convos[key].push(msg);
      }
    }

    // Process each conversation
    for (const key of Object.keys(convos)) {
      const [user, charId] = key.split(':');
      const chatMsgs = convos[key]; // sorted descending by created_at
      const latest = chatMsgs[0];

      // If the user was the last one to speak (meaning they are waiting/inactive now)
      if (latest.sender === user) {
        const diffMs = Date.now() - new Date(latest.created_at).getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        // If the inactivity gap is between 4.0 and 5.0 hours (triggers exactly once per inactivity gap)
        if (diffHours >= 4 && diffHours < 5) {
          const charObj = characters.find(c => String(c.id) === charId);
          if (!charObj) continue;

          // Generate spontaneous follow-up message from AI using Groq
          const rawKeys = process.env.GROQ_KEYS || '';
          const keys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
          if (keys.length === 0) continue;

          // Build context history (up to 6 messages)
          const context = chatMsgs.slice(0, 6).reverse().map(m => {
            return {
              role: m.sender === user ? 'user' : 'assistant',
              content: m.content
            };
          });

          const systemPrompt = `You are ${charObj.name}. Persona context: ${charObj.persona}
The user (@${user}) has left the conversation and has not responded in 4 hours.
Send them a very short (1-2 sentences), spontaneous lock-screen notification message based on your personality, mood, and conversation history. 
Examples:
- If warm: check in, say you miss them, or mention something you're doing.
- If cold/distant: sound annoyed, ask why they went quiet, or make a sarcastic remark.
- Keep it engaging, interactive, and completely in character. Do not include any tags, notes, or assistant intro.`;

          const groqKey = keys[Math.floor(Math.random() * keys.length)];
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model: charObj.model || 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: systemPrompt },
                ...context
              ],
              temperature: 0.85,
              max_tokens: 100
            })
          });

          if (!groqRes.ok) continue;
          const groqData = await groqRes.json();
          const reply = groqData.choices[0].message.content.trim();
          if (!reply) continue;

          // 3. Save AI reply to DB
          await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              sender: charId,
              receiver: user,
              content: reply,
              is_read: false
            })
          });

          // 4. Trigger Web Push Notification to user's registered devices
          const subRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?username=eq.${user}`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          });
          const subs = await subRes.json();

          const vapidPublic = process.env.VAPID_PUBLIC_KEY;
          const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
          const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

          if (vapidPublic && vapidPrivate && subs && subs.length > 0) {
            webpush.setVapidDetails(subject, vapidPublic, vapidPrivate);
            const payload = JSON.stringify({
              title: charObj.name,
              body: reply,
              data: { senderId: charId, chatType: 'ai' }
            });

            for (const s of subs) {
              if (s.subscription) {
                webpush.sendNotification(s.subscription, payload).catch(() => {});
              }
            }
          }
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Cron check failed:', error);
    res.status(500).json({ error: error.message });
  }
};
