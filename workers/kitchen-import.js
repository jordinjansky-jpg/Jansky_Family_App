// workers/kitchen-import.js — Kitchen import + auto-categorization Worker
// Deploy: wrangler deploy workers/kitchen-import.js
// Secrets: CLAUDE_API_KEY (set via wrangler secret put CLAUDE_API_KEY)

const CATEGORY_LIST = [
  'Produce','Dairy','Meat & Seafood','Bakery','Frozen','Pantry',
  'Beverages','Snacks','Household','Personal Care','Baby & Kids',
  'Pets','Clothing','Electronics','Toys','Other'
].join(', ');

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { type, input } = body;

    if (type === 'categorize') {
      return handleCategorize(input, env, corsHeaders);
    }

    if (type === 'url' || type === 'tiktok' || type === 'screenshot') {
      return new Response(JSON.stringify({ error: 'Import not yet active' }), {
        status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown type' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

async function handleCategorize(itemName, env, corsHeaders) {
  if (!itemName || typeof itemName !== 'string') {
    return new Response(JSON.stringify({ category: 'Other' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const prompt = `Categorize this shopping item into exactly one of these categories: ${CATEGORY_LIST}.

Item: "${itemName}"

Reply with only the category name, nothing else.`;

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!claudeRes.ok) {
    return new Response(JSON.stringify({ category: 'Other' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const data = await claudeRes.json();
  const raw = data.content?.[0]?.text?.trim() || 'Other';
  const VALID = new Set(['Produce','Dairy','Meat & Seafood','Bakery','Frozen','Pantry',
    'Beverages','Snacks','Household','Personal Care','Baby & Kids',
    'Pets','Clothing','Electronics','Toys','Other']);
  const category = VALID.has(raw) ? raw : 'Other';

  return new Response(JSON.stringify({ category }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
