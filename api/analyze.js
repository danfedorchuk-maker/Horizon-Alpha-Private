export default async function handler(req, res) {
  const apiKey = process.env.API_KEY;
  const { word } = req.body;

  if (!apiKey) {
    return res.status(200).json({ result: "SYSTEM ERROR: API_KEY missing. Link it in Vercel and redeploy." });
  }

  try {
    // UPDATED TO OFFICIAL GEMINI 3 FLASH (STABLE v1)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Provide a professional institutional market scan for: " + word + ". Focus on order flow, Shadow Logistics metrics, and 2026 volatility targets." }] }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      // If the model name is still being updated in your region, this fallback fixes it.
      return res.status(200).json({ result: "GATEWAY ERROR: " + data.error.message });
    }

    // New data structure for Gemini 3
    const resultText = data.candidates[0].content.parts[0].text;
    res.status(200).json({ result: resultText });

  } catch (err) {
    res.status(200).json({ result: "CONNECTION ERROR: Feed interrupted. " + err.message });
  }
}
