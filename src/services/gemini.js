const analyzeNeed = async (description) => {
    try {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_api_key_here') {
            throw new Error("GEMINI_API_KEY is not configured in .env");
        }

        const prompt = `Analyze the following community issue:

"${description}"

1. Classify urgency as: High / Medium / Low
2. Suggest required volunteer skills (as an array of short strings)
3. Give a short reason for the urgency

Return response in pure JSON format with NO markdown wrapping, using exactly this structure:
{
"urgency": "",
"skills": [],
"reason": ""
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Failed API Call to Gemini");
        
        let textResult = data.candidates[0].content.parts[0].text;
        return JSON.parse(textResult);
    } catch (error) {
        console.error("Error analyzing need with Gemini:", error);
        throw error;
    }
};

const matchVolunteer = async (need, volunteers) => {
    try {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_api_key_here') {
            throw new Error("GEMINI_API_KEY is not configured in .env");
        }

        const reqCount = need.requiredVolunteerCount || 1;

        const volunteersList = volunteers.map(v => 
            `ID: ${v.id}, Name: ${v.name}, Skills: ${v.skills}, Availability: ${v.availability}, Location: ${v.currentLocation}, Blood Group: ${v.bloodGroup}, Gender: ${v.gender}`
        ).join('\n---\n');

        const prompt = `Given the following:

Community Need:
Title: ${need.title}
Description: ${need.description}
Urgency: ${need.aiAnalysis ? need.aiAnalysis.urgency : 'Unknown'}
Required Amount of Volunteers Needed: ${reqCount}
Location: ${need.location} 

Available Volunteers:
${volunteersList}

Select exactly ${reqCount} (or the best available if not enough) best volunteer(s) for this task from the available list based on skill similarity, availability, and location proximity. Consider urgency.

Return MUST BE purely in JSON format WITHOUT markdown wrapping, exactly this structure:
{
  "selectedVolunteerIds": ["id1"],
  "selectedVolunteerNames": ["Name 1"],
  "selectedVolunteerDetails": [{"name": "Name 1", "id": "id1", "pic": "optional"}],
  "reason": "Detailed explanation why these specific individuals were chosen..."
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Failed API Call to Gemini - try again later");
        
        let textResult = data.candidates[0].content.parts[0].text;
        
        // Sometimes LLM returns markdown format even when instructed not to, doing a tiny safety replace:
        textResult = textResult.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        return JSON.parse(textResult);

    } catch (error) {
        console.error("Error matching volunteers with Gemini:", error);
        throw error;
    }
};

module.exports = {
    analyzeNeed,
    matchVolunteer
};
