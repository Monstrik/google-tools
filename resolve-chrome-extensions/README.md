# Chrome Extension ID Resolver

A simple CLI tool to resolve Chrome extension IDs into their official names by scraping the Chrome Web Store.

## Features

- Resolves extension names from IDs.
- Supports both table (pretty-print) and CSV output.
- Handles rate limiting and parallel processing.
- No external dependencies (uses Node.js built-ins).

## File Structure

- `resolve-extensions.js`: The main CLI script.
- `ids.js`: A JavaScript module that exports an array of extension IDs to be resolved.

## Usage

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended for `fetch` support).

### Setup

Ensure your `ids.js` file exports an array of extension IDs:

```javascript
// ids.js
const ids = [
    "mgijmajocneibbeclclceanpgnndlhpc",
    "nmmhkkegccagdldgiimedpiccmgmieda",
    // ... more IDs
];
module.exports = ids;
```

### Running the tool

To print a table of results in the terminal:

```bash
node resolve-extensions.js ./ids.js
```

To export the results to a CSV file:

```bash
node resolve-extensions.js ./ids.js --csv > extensions.csv
```

## How it works

The tool fetches the extension details page from `chromewebstore.google.com` for each ID and extracts the name from the HTML metadata (OpenGraph title or `<title>` tag). It uses a browser-like User-Agent to avoid being blocked.

## Settings

You can adjust the following parameters inside `resolve-extensions.js`:

- `PARALLEL`: Number of concurrent requests (default: 8).
- `RATE_DELAY_MS`: Delay between batches (default: 200ms).
- `TIMEOUT_MS`: Request timeout (default: 15s).
