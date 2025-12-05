document.addEventListener('DOMContentLoaded', () => {
    const providerSelect = document.getElementById('provider-select');
    const groupOpenAI = document.getElementById('group-openai');
    const groupGemini = document.getElementById('group-gemini');

    const apiKeyOpenAI = document.getElementById('api-key-openai');
    const apiKeyGemini = document.getElementById('api-key-gemini');

    const toggleSwitch = document.getElementById('toggle-extension');
    const saveBtn = document.getElementById('save-btn');
    const statusDiv = document.getElementById('status');

    // Load saved settings
    chrome.storage.local.get(['openaiApiKey', 'geminiApiKey', 'provider', 'extensionEnabled'], (result) => {
        if (result.openaiApiKey) apiKeyOpenAI.value = result.openaiApiKey;
        if (result.geminiApiKey) apiKeyGemini.value = result.geminiApiKey;

        if (result.provider) {
            providerSelect.value = result.provider;
        }

        updateVisibility();

        toggleSwitch.checked = result.extensionEnabled !== false;
    });

    // Provider change handler
    providerSelect.addEventListener('change', updateVisibility);

    function updateVisibility() {
        const provider = providerSelect.value;
        if (provider === 'openai') {
            groupOpenAI.style.display = 'block';
            groupGemini.style.display = 'none';
        } else {
            groupOpenAI.style.display = 'none';
            groupGemini.style.display = 'block';
        }
    }

    // Save Settings
    saveBtn.addEventListener('click', () => {
        chrome.storage.local.set({
            provider: providerSelect.value,
            openaiApiKey: apiKeyOpenAI.value.trim(),
            geminiApiKey: apiKeyGemini.value.trim()
        }, () => {
            showStatus('Settings saved!', 'success');
        });
    });

    // Toggle Extension
    toggleSwitch.addEventListener('change', () => {
        const isEnabled = toggleSwitch.checked;
        chrome.storage.local.set({ extensionEnabled: isEnabled });
    });

    function showStatus(msg, type) {
        statusDiv.textContent = msg;
        statusDiv.className = 'status-msg ' + type;
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = 'status-msg';
        }, 2000);
    }
});
