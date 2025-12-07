item('DOMContentLoaded', () => {
    const textSizeSelect = document.getElementById('text-size');
    const showGermanCheckbox = document.getElementById('show-german');
    const saveBtn = document.getElementById('save-btn');
    const statusDiv = document.getElementById('status');

    // Load saved settings
    chrome.storage.local.get(['textSize', 'showGerman'], (result) => {
        if (result.textSize) {
            textSizeSelect.value = result.textSize;
        }

        // Default to true if undefined
        showGermanCheckbox.checked = result.showGerman !== false;
    });

    // Save Settings
    saveBtn.addEventListener('click', () => {
        chrome.storage.local.set({
            textSize: textSizeSelect.value,
            showGerman: showGermanCheckbox.checked
        }, () => {
            showStatus('Settings saved!', 'success');
        });
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
