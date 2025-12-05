chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'TRANSLATE_TEXT') {
        handleTranslation(request.text, sendResponse);
        return true; // Indicates we wish to send a response asynchronously
    }
});

const translationCache = new Map();

async function handleTranslation(text, sendResponse) {
    // Check cache first
    const cached = getFromCache(text);
    if (cached) {
        sendResponse({ translation: cached });
        return;
    }

    try {
        const data = await chrome.storage.local.get(['openaiApiKey', 'geminiApiKey', 'provider']);
        const provider = data.provider || 'openai'; // Default to OpenAI

        if (provider === 'openai') {
            await translateWithOpenAI(text, data.openaiApiKey, sendResponse);
        } else if (provider === 'gemini') {
            await translateWithGemini(text, data.geminiApiKey, sendResponse);
        } else {
            sendResponse({ error: 'Unknown Provider' });
        }

    } catch (err) {
        console.error('Translation Request Failed:', err);
        sendResponse({ error: err.message || 'Network Error' });
    }
}

async function translateWithOpenAI(text, apiKey, sendResponse) {
    if (!apiKey) {
        sendResponse({ error: 'OpenAI API Key not set' });
        return;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Translate German to English. Concise."
                },
                {
                    role: "user",
                    content: text
                }
            ],
            max_tokens: 60
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        sendResponse({ error: `OpenAI Error: ${response.status}` });
        return;
    }

    const result = await response.json();
    const translation = result.choices[0]?.message?.content?.trim();
    const tokenUsage = result.usage?.total_tokens || 0;

    if (translation) {
        addToCache(text, translation);
    }

    sendResponse({ translation: translation, tokenUsage: tokenUsage });
}

// Fallback logic removed for security. User must provide their own key.

async function translateWithGemini(text, apiKey, sendResponse) {
    if (!apiKey) {
        sendResponse({ error: 'Gemini API Key not set' });
        return;
    }

    // Sanitize key (remove newlines/spaces that might have been pasted)
    const effectiveKey = apiKey.trim();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${effectiveKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `Translate the following German text to English. Keep it concise: "${text}"`
                }]
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Gemini Error", errorData);
        sendResponse({ error: `Gemini Error: ${response.status}` });
        return;
    }

    const result = await response.json();
    // Extract Gemini response
    // Structure: candidates[0].content.parts[0].text
    const translation = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    const tokenUsage = result.usageMetadata?.totalTokenCount || 0;

    if (translation) {
        addToCache(text, translation);
        sendResponse({ translation: translation, tokenUsage: tokenUsage });
    } else {
        sendResponse({ error: 'Gemini returned empty response' });
    }
}


function getFromCache(text) {
    return translationCache.get(text);
}

function addToCache(text, translation) {
    translationCache.set(text, translation);
    if (translationCache.size > 500) {
        const firstKey = translationCache.keys().next().value;
        translationCache.delete(firstKey);
    }
}
