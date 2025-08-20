// ==UserScript==
// @name         AllTrails GPX Downloader
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Download GPX files from AllTrails trail pages
// @author       alltrailsgpx
// @match        https://www.alltrails.com/trail/*
// @match        https://www.alltrails.com/explore/trail/*
// @match        https://www.alltrails.com/*/trail/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // AIDEV-NOTE: Polyline decoder implementation for Google's encoded polyline format
    // Precision 5 means we divide by 1e5
    function decodePolyline(encoded, precision = 5) {
        const factor = Math.pow(10, precision);
        let index = 0;
        let lat = 0;
        let lng = 0;
        const coordinates = [];

        while (index < encoded.length) {
            let shift = 0;
            let result = 0;
            let byte;

            // Decode latitude
            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += deltaLat;

            shift = 0;
            result = 0;

            // Decode longitude
            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lng += deltaLng;

            coordinates.push([lng / factor, lat / factor]);
        }

        return coordinates;
    }

    // AIDEV-NOTE: GPX XML generator - creates GPX 1.1 format
    function createGPX(coordinates, routeName) {
        const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="alltrailsgpx-userscript" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`;

        const trackPoints = coordinates.map(coord => 
            `      <trkpt lat="${coord[1]}" lon="${coord[0]}"></trkpt>`
        ).join('\n');

        const gpxContent = `${gpxHeader}
  <trk>
    <name>${escapeXml(routeName)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;

        return gpxContent;
    }

    function escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
        });
    }

    // Extract trail ID from URL
    function getTrailId() {
        const match = window.location.pathname.match(/trail\/[^\/]+\/[^\/]+\/([^\/\?]+)/);
        if (!match) {
            // Try alternate URL format
            const altMatch = window.location.pathname.match(/explore\/trail\/[^\/]+\/[^\/]+\/([^\/\?]+)/);
            return altMatch ? altMatch[1] : null;
        }
        return match[1];
    }

    // Download file
    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // AIDEV-NOTE: Network interception setup to capture API responses
    let apiResponseData = null;
    let isIntercepting = false;

    function interceptFetch() {
        if (isIntercepting) return;
        isIntercepting = true;

        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const [resource, config] = args;
            const url = typeof resource === 'string' ? resource : resource.url;
            
            return originalFetch.apply(this, args).then(async response => {
                // Check if this is the trails API endpoint we're looking for
                if (url && url.includes('/api/alltrails/v3/trails/')) {
                    try {
                        const clonedResponse = response.clone();
                        const data = await clonedResponse.json();
                        apiResponseData = data;
                        console.log('AllTrails GPX: Captured trail data');
                    } catch (e) {
                        console.error('AllTrails GPX: Error capturing response:', e);
                    }
                }
                return response;
            });
        };
    }

    // Process the captured API data and convert to GPX
    function processApiData() {
        if (!apiResponseData) {
            alert('No trail data captured. Please try again.');
            return;
        }

        try {
            // Extract polyline data - matching the Rust implementation path
            const polylinePath = ['trails', 0, 'defaultMap', 'routes', 0, 'lineSegments', 0, 'polyline', 'pointsData'];
            let polylineData = apiResponseData;
            
            for (const key of polylinePath) {
                polylineData = polylineData[key];
                if (!polylineData) {
                    throw new Error('Polyline data not found in API response');
                }
            }

            // Extract route name
            const routeName = apiResponseData.trails?.[0]?.name || 'AllTrails Route';

            // Decode polyline
            const coordinates = decodePolyline(polylineData, 5);

            // Create GPX
            const gpxContent = createGPX(coordinates, routeName);

            // Download file
            const filename = `${routeName}.gpx`;
            downloadFile(gpxContent, filename);

            console.log('AllTrails GPX: Successfully downloaded GPX file');
        } catch (error) {
            console.error('AllTrails GPX: Error processing data:', error);
            alert('Error converting trail data to GPX: ' + error.message);
        }
    }

    // Handle button click
    async function handleDownloadGPX() {
        const button = document.getElementById('alltrails-gpx-download-btn');
        button.textContent = 'Loading...';
        button.disabled = true;

        try {
            // Setup interception if not already done
            interceptFetch();

            // Find and click the map element to trigger loading
            const mapButton = document.querySelector('button[aria-label*="map"]');
            if (!mapButton) {
                // Try to find any clickable map element
                const mapElements = Array.from(document.querySelectorAll('*')).filter(el => {
                    const ariaLabel = el.getAttribute('aria-label');
                    return ariaLabel && ariaLabel.toLowerCase().includes('map');
                });
                
                if (mapElements.length > 0) {
                    mapElements[0].click();
                } else {
                    throw new Error('Could not find map element to load trail data');
                }
            } else {
                mapButton.click();
            }

            // Wait for API response to be captured
            let attempts = 0;
            const maxAttempts = 20;
            
            while (!apiResponseData && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }

            if (apiResponseData) {
                processApiData();
            } else {
                // If no data captured, try direct API call as fallback
                const trailId = getTrailId();
                if (trailId) {
                    const response = await fetch(`/api/alltrails/v3/trails/${trailId}`);
                    apiResponseData = await response.json();
                    processApiData();
                } else {
                    throw new Error('Could not capture trail data. Please refresh and try again.');
                }
            }
        } catch (error) {
            console.error('AllTrails GPX: Error:', error);
            alert('Error downloading GPX: ' + error.message);
        } finally {
            button.textContent = 'Download GPX';
            button.disabled = false;
        }
    }

    // Add download button to the page
    function addDownloadButton() {
        // Check if button already exists
        if (document.getElementById('alltrails-gpx-download-btn')) {
            return;
        }

        // Find a suitable location for the button
        const targetSelectors = [
            '.styles-module__actions___q6T3O',  // Action buttons container
            '.styles-module__content___jG8CD',   // Content area
            'h1',                                 // Near the title
            '.MuiBox-root'                       // Generic container
        ];

        let targetElement = null;
        for (const selector of targetSelectors) {
            targetElement = document.querySelector(selector);
            if (targetElement) break;
        }

        if (!targetElement) {
            console.log('AllTrails GPX: Could not find suitable location for button');
            return;
        }

        // Create button
        const button = document.createElement('button');
        button.id = 'alltrails-gpx-download-btn';
        button.textContent = 'Download GPX';
        button.style.cssText = `
            background-color: #428a13;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin: 10px;
            transition: background-color 0.2s;
        `;
        
        button.onmouseover = () => button.style.backgroundColor = '#5aa023';
        button.onmouseout = () => button.style.backgroundColor = '#428a13';
        button.onclick = handleDownloadGPX;

        // Create container for button
        const container = document.createElement('div');
        container.style.cssText = 'display: inline-block; margin: 10px 0;';
        container.appendChild(button);

        // Insert button
        targetElement.parentNode.insertBefore(container, targetElement.nextSibling);
        console.log('AllTrails GPX: Download button added');
    }

    // Initialize
    function init() {
        // Setup fetch interception immediately
        interceptFetch();
        
        // Wait for page to load then add button
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(addDownloadButton, 1000);
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                setTimeout(addDownloadButton, 1000);
            });
        }

        // Re-add button if page content changes (SPA navigation)
        const observer = new MutationObserver(() => {
            if (!document.getElementById('alltrails-gpx-download-btn')) {
                addDownloadButton();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    init();
})();