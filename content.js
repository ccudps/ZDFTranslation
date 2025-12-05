let observer = null;
let overlay = null;
let germanDiv = null;
let englishDiv = null;
let isEnabled = false;
let currentText = "";
let debounceTimer = null;
let lastVideoSrc = "";
let isBuffering = false;
let currentVideoElement = null;
let hasBufferedFirstSubtitle = false;

// --- NEW: Sync Engine State ---
let subtitleTrack = [];
let isUsingInterceptor = false;
let currentSubtitleIndex = -1;
let sessionTokenUsage = 0;

// Initialize
function init() {
    createOverlay();

    // Check functionality
    chrome.storage.local.get(['extensionEnabled'], (result) => {
        isEnabled = result.extensionEnabled !== false;
        updateOverlayVisibility();
        if (isEnabled) {
            startObserving();
        }
    });

    // Capture play events to buffer on new videos
    document.addEventListener('play', handleVideoPlay, true);

    // Handle Fullscreen changes to keep overlay visible
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // Safari/Old Chrome

    // Update visibility loop (aggressive check for z-index battles)
    setInterval(ensureOverlayOnTop, 2000);

    // Listen for changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.extensionEnabled) {
            isEnabled = changes.extensionEnabled.newValue;
            updateOverlayVisibility();
            if (isEnabled) {
                startObserving();
            } else {
                stopObserving();
            }
        }
    });

    // Inject the Main World interceptor
    injectInterceptor();

    // Listen for intercepted subtitles
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data.type && event.data.type === 'ZDF_SUBTITLE_INTERCEPT') {
            handleInterceptedSubtitle(event.data);
        }
    });
}

function injectInterceptor() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

function handleInterceptedSubtitle(data) {
    if (!data.content) return;

    showOverlayMessage('Subtitle file received! Processing...', 2000);
    console.log('ZDF Lingua: Parsing subtitle XML...');

    try {
        subtitleTrack = parseTTML(data.content);
        console.log(`ZDF Lingua: Parsed ${subtitleTrack.length} subtitles.`);
        if (subtitleTrack.length > 0) {
            isUsingInterceptor = true;
            showOverlayMessage(`Loaded ${subtitleTrack.length} subtitles directly!`, 3000);

            // Start the sync engine if not already running
            if (currentVideoElement) {
                startSyncEngine(currentVideoElement);
            }
            // Stop the DOM observer as we have the file
            stopObserving();
        }
    } catch (e) {
        console.error('ZDF Lingua: Failed to parse subtitles', e);
        showOverlayMessage('Failed to parse subtitles.', 3000);
    }
}

function parseTTML(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const paragraphs = xmlDoc.getElementsByTagName("tt:p"); // Handle namespace
    const track = [];

    // Helper to parse time HH:MM:SS.mmm to seconds
    const parseTime = (timeStr) => {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        if (parts.length < 3) return 0;
        const seconds = parseFloat(parts[2]);
        const minutes = parseInt(parts[1], 10);
        const hours = parseInt(parts[0], 10);
        return hours * 3600 + minutes * 60 + seconds;
    };

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const begin = parseTime(p.getAttribute("begin"));
        const end = parseTime(p.getAttribute("end"));

        // Extract text content, handling <br/> or spans
        let text = "";
        // If it has spans, join them
        const spans = p.getElementsByTagName("tt:span");
        if (spans.length > 0) {
            for (let j = 0; j < spans.length; j++) {
                text += spans[j].textContent + " ";
            }
        } else {
            text = p.textContent;
        }
        text = text.trim();

        track.push({
            index: i,
            start: begin,
            end: end,
            text: text,
            translation: null,
            isTranslating: false
        });
    }
    return track;
}

function startSyncEngine(video) {
    // Remove old listener if exists to avoid dupes (though named function helps)
    video.removeEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('timeupdate', handleTimeUpdate);
    console.log('ZDF Lingua: Sync Engine Started');
}

function handleTimeUpdate(event) {
    if (!isUsingInterceptor) return;

    const video = event.target;
    // Round for stability, though exact is fine.
    const time = video.currentTime;

    // 1. Display Logic - Optimized w/ Index Tracking
    // We expect time to move forward, but user can seek.

    // Check if current index is still valid
    let activeSub = null;
    let index = currentSubtitleIndex;

    // If invalid index (init state), start search from 0
    if (index < 0) index = 0;

    // Optimize: Check current, then next. 
    // If seeked backwards, we unfortunately have to search or step back.
    // Heuristic: If time is significantly behind current index start, do binary/linear search.

    // Simple robust approach for this size (usually <2000 lines):
    // 1. Check current index.
    // 2. Check next index.
    // 3. If not found, binary search or full find (fallback).

    const currentSub = subtitleTrack[index];

    if (currentSub && time >= currentSub.start && time <= currentSub.end) {
        activeSub = currentSub;
    } else if (currentSub && time > currentSub.end) {
        // Moved forward. Check next few.
        for (let i = index + 1; i < subtitleTrack.length; i++) {
            if (time >= subtitleTrack[i].start && time <= subtitleTrack[i].end) {
                activeSub = subtitleTrack[i];
                break;
            }
            if (subtitleTrack[i].start > time) break;
        }
    } else {
        // Seeked backward or random jump. Fallback to find.
        activeSub = subtitleTrack.find(sub => time >= sub.start && time <= sub.end);
    }

    if (activeSub) {
        if (currentSubtitleIndex !== activeSub.index) {
            currentSubtitleIndex = activeSub.index;
            updateDisplay(activeSub);
        }
    } else {
        // No active subtitle.
        // Clear if we were showing one
        if (currentSubtitleIndex !== -1) {
            // Only clear if we really left the window
            const lastSub = subtitleTrack[currentSubtitleIndex];
            if (lastSub && (time < lastSub.start || time > lastSub.end)) {
                clearDisplay();
                // Don't reset index to -1 if we just are in a gap; keep it as reference for "next"
                // But wait, if we seeked far away, reference is useless.
                // Let's keep index pointing to "last seens" or just leave it.
            }
        }
        // If we are in a gap, we might want to know "next" for lookahead.
    }

    // 2. Lookahead Translation Logic - Optimized
    // Only check from current index + 1
    const lookaheadTime = time + 10;

    // Determine start index for lookahead
    let searchStartIndex = currentSubtitleIndex;
    if (searchStartIndex < 0) {
        // Find first future subtitle
        const next = subtitleTrack.find(s => s.start > time);
        searchStartIndex = next ? next.index : -1;
    }

    if (searchStartIndex !== -1) {
        for (let i = searchStartIndex; i < subtitleTrack.length; i++) {
            const sub = subtitleTrack[i];

            // Too far ahead?
            if (sub.start > lookaheadTime) break;

            // In the window?
            if (sub.start > time) {
                if (!sub.translation && !sub.isTranslating) {
                    triggerTranslation(sub);
                }
            }
        }
    }
}

function updateDisplay(subtitle) {
    // Ensure overlay elements exist
    if (!germanDiv || !englishDiv) createOverlay();

    germanDiv.textContent = subtitle.text;
    germanDiv.style.opacity = '1';

    if (subtitle.translation) {
        englishDiv.textContent = subtitle.translation;
        englishDiv.style.opacity = '1';
    } else {
        // It might be arriving soon, show nothing or ...?
        // Let's show nothing to keep it clean, or loading if very close?
        englishDiv.textContent = "";
        // If we are here, it means we missed the pre-fetch window or it's slow.
        // Trigger it immediately just in case (though lookahead should have caught it)
        if (!subtitle.isTranslating) triggerTranslation(subtitle);
    }

    if (overlay) overlay.style.display = 'block';
}

function clearDisplay() {
    if (germanDiv) {
        germanDiv.textContent = "";
        germanDiv.style.opacity = '0';
    }
    if (englishDiv) {
        englishDiv.textContent = "";
        englishDiv.style.opacity = '0';
    }
    // Don't hide overlayDiv completely to avoid layout jumps if we have fixed pos
    // But opacity 0 is fine.
}

function triggerTranslation(subtitle) {
    subtitle.isTranslating = true;

    try {
        chrome.runtime.sendMessage({
            action: "TRANSLATE_TEXT", // Use existing action
            text: subtitle.text
        }, (response) => {
            if (handleRuntimeError('triggerTranslation')) {
                subtitle.isTranslating = false;
                return;
            }

            if (response && response.translation) {
                subtitle.translation = response.translation;

                // Track Token Usage
                if (response.tokenUsage) {
                    sessionTokenUsage += response.tokenUsage;
                    console.log(`ZDF Lingua: Translation complete. Tokens: ${response.tokenUsage}. Session Total: ${sessionTokenUsage}`);
                }

                // If this is currently displayed, update it immediately!
                if (currentSubtitleIndex === subtitle.index) {
                    if (englishDiv) englishDiv.textContent = subtitle.translation;
                }
            } else if (response && response.error) {
                console.error(`ZDF Lingua: Translation Error for #${subtitle.index}:`, response.error);
                subtitle.isTranslating = false;
            } else {
                console.warn(`ZDF Lingua: received empty response for #${subtitle.index}`);
            }
        });
    } catch (e) {
        if (e.message.includes('Extension context invalidated')) {
            console.warn('ZDF Lingua: Context invalidated (catch). Stopping sync.');
            forceStopEngine();
        } else {
            console.error('ZDF Lingua: Unexpected error in triggerTranslation', e);
        }
    }
}

function showOverlayMessage(message, duration = 0) {
    if (!englishDiv) createOverlay();
    englishDiv.textContent = message;
    englishDiv.style.color = "#ffffff"; // White for feedback
    if (duration > 0) {
        setTimeout(() => {
            if (englishDiv.textContent === message) { // Only clear if it's still our message
                englishDiv.textContent = "";
                englishDiv.style.color = ""; // Reset color
            }
        }, duration);
    }
}

function createOverlay() {
    if (document.getElementById('zdf-lingua-overlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'zdf-lingua-overlay';

    germanDiv = document.createElement('div');
    germanDiv.className = 'zdf-lingua-german';

    englishDiv = document.createElement('div');
    englishDiv.className = 'zdf-lingua-english';

    overlay.appendChild(germanDiv);
    overlay.appendChild(englishDiv);

    document.body.appendChild(overlay);
}

function updateOverlayVisibility() {
    if (overlay) {
        overlay.style.display = isEnabled ? 'block' : 'none';
    }
}

function startObserving() {
    if (observer) return;

    // Try to find the subtitle container.
    // ZDF often uses Shaka Player: .shaka-text-container
    // Or sometimes specific subtitle classes.
    // We'll observe distinct changes.

    const targetNode = document.body; // Broad observation initially, or scoped if possible
    const config = { childList: true, subtree: true, characterData: true };

    observer = new MutationObserver((mutations) => {
        // If we have the file, we ignore the DOM observer!
        if (isUsingInterceptor) return;

        if (!isEnabled) return;

        for (const mutation of mutations) {
            let target = mutation.target;

            // If text node changes, look at its parent element
            if (target.nodeType === 3 /* Node.TEXT_NODE */) {
                target = target.parentElement;
            }

            // Ensure we have an element to check
            if (!target || !target.classList) continue;

            // Check if we are inside a candidate container (broad match)
            if (target.matches && (
                target.matches('.shaka-text-container') ||
                target.matches('[class*="shaka"]') ||
                target.matches('[class*="subtitle"]') ||
                target.matches('[class*="caption"]')
            )) {
                extractText();
                break;
            }

            // Also check parent/closest
            if (target.closest) {
                const closest = target.closest('.shaka-text-container, [class*="shaka"], [class*="subtitle"], [class*="caption"]');
                if (closest && !overlay.contains(closest)) {
                    extractText();
                    break;
                }
            }
        }
    });

    observer.observe(targetNode, config);
    console.log('ZDF Lingua: Observer started');
}

function stopObserving() {
    if (observer) {
        observer.disconnect();
        observer = null;
        console.log('ZDF Lingua: Observer stopped');
    }
}

function extractText() {
    // Legacy/Fallback Extraction
    // We keep this for now in case interception fails or for partial/live segments
    const selectors = [
        '.shaka-text-container',
        '[class*="shaka-text"]',
        '[class*="subtitle"]',
        '[class*="caption"]',
        '#subtitle-container'
    ];

    let container = null;
    for (const sel of selectors) {
        // Exclude our own overlay from search
        const found = document.querySelectorAll(sel);
        for (const el of found) {
            if (overlay && overlay.contains(el)) continue;
            // Check if it's visible and has text
            if (el.textContent.trim().length > 0 && el.offsetParent !== null) {
                container = el;
                break;
            }
        }
        if (container) break;
    }

    // Fallback: If we can't find a container by class, but the mutation triggered extractText,
    // we might want to look at the mutation target?
    // (Handled by the observer logic calling us)

    if (!container) {
        return;
    }

    const text = container.textContent.trim();
    // console.log('ZDF Lingua: Found text in DOM:', text);

    if (text && text !== currentText) {
        currentText = text;

        // Only translate if we haven't handled this via interception (TODO)
        // For now, keep fallback active
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            handleNewText(currentText);
        }, 75);
    } else if (!text && currentText) {
        // Cleared
        currentText = "";
        germanDiv.textContent = "";
        englishDiv.textContent = "";
    }
}

function handleNewText(text) {
    // console.log('ZDF Lingua: Translating (Fallback) ->', text);
    germanDiv.textContent = text;
    englishDiv.textContent = ""; // Silent loading

    // Guard against missing runtime (e.g. invalid context)
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        console.error('ZDF Lingua: Context invalid (runtime missing)');
        englishDiv.textContent = "";
        const warning = document.createElement('span');
        warning.className = "zdf-lingua-warning";
        warning.textContent = "Extension updated. Please refresh the page.";
        englishDiv.appendChild(warning);
        return;
    }

    try {
        chrome.runtime.sendMessage({ action: 'TRANSLATE_TEXT', text: text }, (response) => {
            if (handleRuntimeError('handleNewText')) {
                if (englishDiv) {
                    englishDiv.textContent = "";
                    const warning = document.createElement('span');
                    warning.className = "zdf-lingua-warning";
                    warning.textContent = "Extension error. Check console.";
                    englishDiv.appendChild(warning);
                }
                return;
            }

            if (response && response.translation) {
                englishDiv.textContent = response.translation;
                englishDiv.style.color = ""; // Reset color
            } else if (response && response.error) {
                englishDiv.textContent = response.error;
            }
        });
    } catch (e) {
        console.error('ZDF Lingua: Exception during message send:', e);
        englishDiv.textContent = "";
        const warning = document.createElement('span');
        warning.className = "zdf-lingua-warning";
        warning.textContent = "Error. Please refresh.";
        englishDiv.appendChild(warning);
    }
}

function handleRuntimeError(context) {
    if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message;
        console.error(`ZDF Lingua: Runtime Error in ${context}:`, chrome.runtime.lastError);

        if (msg && msg.includes('Extension context invalidated')) {
            console.warn('ZDF Lingua: Context invalidated. Stopping engine.');
            forceStopEngine();
            if (englishDiv) {
                englishDiv.textContent = "";
                const warning = document.createElement('span');
                warning.className = "zdf-lingua-warning";
                warning.textContent = "Extension updated. Please refresh.";
                englishDiv.appendChild(warning);
            }
            return true;
        }
        return true;
    }
    return false;
}


function handleVideoPlay(event) {
    // Simplified: Just update currentVideoElement, no buffering/ghosting
    if (!isEnabled) return;

    const video = event.target;
    if (video.tagName !== 'VIDEO') return;

    currentVideoElement = video;
    if (video.currentSrc !== lastVideoSrc) {
        console.log('ZDF Lingua: New video source detected:', video.currentSrc);
        lastVideoSrc = video.currentSrc;
        hasBufferedFirstSubtitle = false;
        // No blackout, no buffering. Rely on interceptor.
    }
}



function handleFullscreenChange() {
    if (!overlay) return;

    const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsElement) {
        console.log('ZDF Lingua: Fullscreen entered, reparenting overlay');
        fsElement.appendChild(overlay);
        // Ensure style is adaptable
        overlay.style.position = 'absolute';
    } else {
        console.log('ZDF Lingua: Fullscreen exited, restoring overlay');
        document.body.appendChild(overlay);
        overlay.style.position = 'fixed'; // Restore specific fixed if needed, or stick to absolute + proper CSS
    }
}

function forceStopEngine() {
    isUsingInterceptor = false;
    isEnabled = false;
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (currentVideoElement) {
        currentVideoElement.removeEventListener('timeupdate', handleTimeUpdate);
    }
    if (englishDiv) {
        englishDiv.textContent = "Extension Disconnected. Please Refresh.";
        englishDiv.style.color = "#ffffff";
    }
}

function ensureOverlayOnTop() {
    if (overlay) overlay.style.zIndex = 'var(--zl-z-max)'; // Use CSS variable via JS if needed, or just let CSS handle it. 
    // Actually, setting JS style overrides CSS class, so we should keep the explicit value or read variable.
    // Safe to just set string here to match.
    if (overlay) overlay.style.zIndex = '2147483647';
}

// Run
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
