# alltrailsgpx

alltrailsgpx creates a GPX file from AllTrails route data, even if you don't have the region unlocked (or AllTrails premium). It extracts the map drawing data directly from the AllTrails API response and converts it into a GPX track.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click [here to install the script](https://github.com/idomanteu/alltrailsgpx/raw/main/alltrails-gpx-downloader.user.js) or copy the code manually
3. The script automatically activates on all AllTrails trail pages

## Usage

1. Navigate to any AllTrails trail page (e.g., `https://www.alltrails.com/trail/us/vermont/mount-mansfield-via-long-and-hazelton-trail`)
2. Look for the green "Download GPX" button on the page
3. Click the button to download the GPX file

The userscript automatically:

- Intercepts the API response when you click the button
- Decodes the polyline data from AllTrails' format
- Converts it to standard GPX 1.1 format
- Downloads the file with the full route name (e.g., `Mount Mansfield via Long and Hazelton Trail.gpx`)

<img width="1150" height="622" alt="demo" src="https://github.com/user-attachments/assets/03403a99-c949-4645-9e4b-affd21aa1a6b" />

## How It Works

The userscript:

1. Adds a download button to AllTrails trail pages
2. Intercepts network requests to capture the trail API data from `https://www.alltrails.com/api/alltrails/v3/trails/{route_id}`
3. Extracts the encoded polyline from the API response at path: `/trails/0/defaultMap/routes/0/lineSegments/0/polyline/pointsData`
4. Decodes the Google polyline format (precision 5) into an array of latitude/longitude coordinates
5. Converts the coordinates into GPX format:
   - Creates a GPX 1.1 XML document with proper namespace declarations
   - Wraps coordinates in a `<trk>` (track) element with the trail name
   - Each coordinate becomes a `<trkpt>` (track point) with lat/lon attributes
   - Groups all points into a single `<trkseg>` (track segment)
6. Triggers a browser download of the GPX file with the trail's full name

## Credits

This userscript is based on the original [alltrailsgpx](https://github.com/cdown/alltrailsgpx) project by Chris Down, which was implemented as a Rust command-line tool. This JavaScript version provides the same functionality directly in the browser for easier use.

This project is licensed under the [MIT License](LICENSE).

