export default async function handler(req, res) {
  const apiKey = process.env.API_KEY;
  const word = req.body.word || "Market Asset";

  if (!apiKey) {
    return res.status(200).json({ result: "SYSTEM ERROR: API_KEY is missing from Vercel Settings. Add it and redeploy." });
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Provide a professional institutional market scan for: " + word }] }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(200).json({ result: "GOOGLE ERROR: " + data.error.message });
    }

    const result = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ result: result });

  } catch (err) {
    return res.status(200).json({ result: "CONNECTION ERROR: " + err.message });
  }
}
