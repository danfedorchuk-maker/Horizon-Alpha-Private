export default async function handler(req, res) {
  const apiKey = process.env.API_KEY;
  const { word } = req.body;

  if (!apiKey) {
    return res.status(200).json({ result: "SYSTEM ERROR: API_KEY missing in Vercel. Add it and redeploy." });
  }

  try {
    // UPDATED TO OFFICIAL APRIL 2026 PREVIEW ENDPOINT
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Provide a professional institutional market scan for: " + word + ". Focus on order flow, liquidity traps, and 2026 volatility." }] }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(200).json({ result: "GOOGLE GATEWAY ERROR: " + data.error.message });
    }

    // Success path for the Gemini 3 response structure
    if (data.candidates && data.candidates[0].content) {
        const resultText = data.candidates[0].content.parts[0].text;
        res.status(200).json({ result: resultText });
    } else {
        res.status(200).json({ result: "DATA ERROR: Response received but format is empty. Try again." });
    }

  } catch (err) {
    res.status(200).json({ result: "NETWORK ERROR: Terminal could not reach the 3.0 server. " + err.message });
  }
}
