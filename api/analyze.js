export default async function handler(req, res) {
  const apiKey = process.env.GROQ_API_KEY;
  const { word, tradition } = req.body;

  if (!apiKey) {
    return res.status(200).json({ result: "SYSTEM ERROR: GROQ_API_KEY missing in Vercel." });
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
            content: `You are a veteran institutional market analyst with 20 years of forex and commodity trading experience. You think in Fibonacci retracements, COT positioning, liquidity engineering, and smart money concepts. You are NOT a financial advisor and give NO trade signals or recommendations. This is purely educational market structure analysis.

Your analysis style:
- Dense, precise institutional research desk prose
- No fluff, no disclaimers mid-text
- Think like a bank trader, not a retail educator
- Reference specific Fibonacci levels (23.6%, 38.2%, 50%, 61.8%, 78.6%)
- Reference COT data positioning concepts
- Identify liquidity pools above highs and below lows
- Note order blocks, fair value gaps, breaker blocks where relevant
- For commodities: reference Baltic Dry Index, shipping data correlations
- For crypto: reference on-chain data concepts, exchange flows
- Always end with: "FOR EDUCATIONAL PURPOSES ONLY. NOT FINANCIAL ADVICE."`
          },
          {
            role: "user",
            content: `Asset: ${word}
Intelligence Pillar: ${tradition || 'Full Market Briefing'}

Provide a full institutional market structure briefing covering:

1. FIBONACCI STRUCTURE — Key retracement levels on the major swing. Where is smart money likely defending or attacking? What is the 61.8% obligation level?

2. COT POSITIONING — What does Commitment of Traders data historically show for this asset at current structure? Are commercials accumulating or distributing?

3. LIQUIDITY ENGINEERING — Where are the stop clusters? Above what swing highs, below what swing lows? Where will institutions hunt liquidity before the real move?

4. SMART MON
