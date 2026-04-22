export default async function handler(req, res) {
  const apiKey = process.env.API_KEY;
  const { word } = req.body;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Institutional market analysis for: " + word }] }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(500).json({ result: "Key Error: " + data.error.message });
    }

    const resultText = data.candidates[0].content.parts[0].text;
    res.status(200).json({ result: resultText });
  } catch (error) {
    res.status(500).json({ result: "Connection Error: " + error.message });
  }
}
