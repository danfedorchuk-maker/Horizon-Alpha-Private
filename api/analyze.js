const handler = async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  const { word, tradition } = req.body || {};

  if (!apiKey) {
    return res.status(200).json({ result: "SYSTEM ERROR: GROQ_API_KEY missing." });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ result: "Method not allowed." });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "You are a veteran institutional market analyst with 20 years of forex and commodity trading experience. You think in Fibonacci retracements, COT positioning, liquidity engineering, and smart money concepts. You are NOT a financial advisor and give NO trade signals. This is purely educational market structure analysis. Write dense, precise institutional research prose. Reference Fibonacci levels (23.6%, 38.2%, 50%, 61.8%, 78.6%), COT positioning, liquidity pools, order blocks, fair value gaps. For commodities reference Baltic Dry Index. For crypto reference on-chain flows. Always end with: FOR EDUCATIONAL PURPOSES ONLY. NOT FINANCIAL ADVICE."
          },
          {
            role: "user",
            content: `Asset: ${word || 'EUR/USD'}\nIntelligence Pillar: ${tradition || 'Full Market Briefing'}\n\nProvide a full institutional market structure briefing covering:\n1. FIBONACCI STRUCTURE\n2. COT POSITIONING\n3. LIQUIDITY ENGINEERING\n4. SMART MONEY CONCEPTS\n5. MACRO CONTEXT\n6. SHADOW LOGISTICS\n\nWrite 600-800 words of dense institutional analysis.`
          }
        ]
      })
    });

    const data = await response.json();

    if (data.choices && data.choices[0] && data.choices[0].message) {
      return res.status(200).json({ result: data.choices[0].message.content });
    } else {
      return res.status(200).json({ result: "DATA ERROR: " + JSON.stringify(data) });
    }

  } catch (err) {
    return res.status(200).json({ result: "NETWORK ERROR: " + err.message });
  }
};

module.exports = handler;
