(function () {
    console.log('ZDF Lingua: Network Interceptor Active (External)');
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = args[0] instanceof Request ? args[0].url : args[0];
        const response = await origFetch.apply(this, args);

        // Check for potential subtitle files
        if (url && (
            url.includes('.vtt') ||
            url.includes('.ttml') ||
            url.includes('.xml') ||
            url.includes('caption') ||
            url.includes('subtitle')
        )) {
            console.log('ZDF Lingua: Potential subtitle fetch detected', url);
            try {
                const clone = response.clone();
                clone.text().then(text => {
                    window.postMessage({
                        type: 'ZDF_SUBTITLE_INTERCEPT',
                        content: text,
                        url: url
                    }, '*');
                });
            } catch (e) {
                console.error('ZDF Lingua: Failed to clone response', e);
            }
        }
        return response;
    };

    // Also hook XHR just in case
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.addEventListener('load', function () {
            if (url && (
                url.includes('.vtt') ||
                url.includes('.ttml') ||
                url.includes('.xml') ||
                url.includes('caption') ||
                url.includes('subtitle')
            )) {
                console.log('ZDF Lingua: XHR subtitle detected', url);
                // XHR responseText is only available if responseType is text or empty
                if (!this.responseType || this.responseType === 'text') {
                    window.postMessage({
                        type: 'ZDF_SUBTITLE_INTERCEPT',
                        content: this.responseText,
                        url: url
                    }, '*');
                }
            }
        });
        origOpen.apply(this, arguments);
    };
})();
