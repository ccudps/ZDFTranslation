(function () {
    console.log('ZDF Lingua: Network Interceptor Active (External)');
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        let url = args[0];
        if (url instanceof Request) {
            url = url.url;
        } else if (url instanceof URL) { // Handle URL objects
            url = url.toString();
        }
        // Ensure url is a string before checking includes
        if (typeof url !== 'string') {
            // If it's something else (unlikely or not relevant), ignore
            url = "";
        }

        const response = await origFetch.apply(this, args);


        // Check for potential subtitle files by URL pattern first
        if (url && (
            url.includes('.vtt') ||
            url.includes('.ttml') ||
            url.includes('.xml') ||
            url.includes('caption') ||
            url.includes('subtitle')
        )) {
            // Safety Check: Validate Response content before cloning
            try {
                const contentType = response.headers.get('content-type');
                const contentLength = response.headers.get('content-length');

                // Allow known subtitle types or missing content-type (lenient), but block video/audio/image
                const isMedia = contentType && (contentType.includes('video') || contentType.includes('audio') || contentType.includes('image') || contentType.includes('octet-stream'));
                const isTooLarge = contentLength && parseInt(contentLength) > 1024 * 1024 * 5; // 5MB limit

                if (!isMedia && !isTooLarge) {
                    // console.log('ZDF Lingua: Intercepting candidate:', url);
                    const clone = response.clone();
                    clone.text().then(text => {
                        // Double check: if text is empty or binary-looking, ignore? 
                        // For now just send it.
                        window.postMessage({
                            type: 'ZDF_SUBTITLE_INTERCEPT',
                            content: text,
                            url: url
                        }, '*');
                    }).catch(err => {
                        // console.warn('ZDF Lingua: Clone text error', err);
                    });
                }
            } catch (e) {
                console.error('ZDF Lingua: Failed to process response clone', e);
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
                // XHR responseText is only available if responseType is text or empty
                if (!this.responseType || this.responseType === 'text') {
                    // XHR usually buffers anyway, so less risk of "reading stream", but still check size if possible
                    // In XHR, getAllResponseHeaders() is available
                    try {
                        const cType = this.getResponseHeader('Content-Type');
                        const isMedia = cType && (cType.includes('video') || cType.includes('audio') || cType.includes('image'));

                        if (!isMedia && this.responseText && this.responseText.length < 5 * 1024 * 1024) {
                            window.postMessage({
                                type: 'ZDF_SUBTITLE_INTERCEPT',
                                content: this.responseText,
                                url: url
                            }, '*');
                        }
                    } catch (e) {
                        // Ignore XHR access errors
                    }
                }
            }
        });
        origOpen.apply(this, arguments);
    };
})();
