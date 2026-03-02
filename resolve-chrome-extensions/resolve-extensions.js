#!/usr/bin/env node
/**
 * resolve-extensions.js
 *
 * CLI to resolve Chrome extension IDs → names.
 *
 * HOW TO USE
 * 1) Put your existing array in a separate file (e.g., ids.js) that exports it:
 *      // ids.js
 *      module.exports = pluginsValue; // where pluginsValue is your array
 *
 * 2) Run:
 *      node resolve-extensions.js ./ids.js            # prints table
 *   Or to output CSV:
 *      node resolve-extensions.js ./ids.js --csv > extensions.csv
 *
 * NOTES
 * - Works without Chrome Web Store access by using a read-only text proxy.
 * - Tries official Web Store first, then a mirror.
 * - No need to modify your array values.
 */

const fs = require('fs');
const path = require('path');
const {setTimeout: sleep} = require('timers/promises');

// ---- INPUT ----
if (process.argv.length < 3) {
    console.error('Usage: node resolve-extensions.js <path-to-array-module> [--csv]');
    process.exit(1);
}
const idsPath = path.resolve(process.argv[2]);
let ids;
try {
    ids = require(idsPath);
    if (!Array.isArray(ids)) throw new Error('Exported value is not an array.');
} catch (e) {
    console.error(`Failed to load array from "${idsPath}": ${e.message}`);
    process.exit(1);
}

const OUTPUT_CSV = process.argv.includes('--csv');

// ---- SETTINGS ----
const SOURCES = [
    // Read-only text proxy to bypass CORS and store UI scripts. We request the raw HTML text.
    {name: 'webstore', url: id => `http://chromewebstore.google.com/detail/${id}`},
    // { name: 'crxsoso',  url: id => `http://www.crxsoso.com/webstore/detail/${id}` },
];

const PARALLEL = 8;       // concurrency limit
const RATE_DELAY_MS = 200; // delay between batches
const TIMEOUT_MS = 15000; // per request

// ---- HELPERS ----
function cleanTitle(s) {
    return s
        .replace(/\s*-\s*Chrome Web Store.*$/i, '')
        .replace(/\s*\|\s*Chrome Web Store.*$/i, '')
        .replace(/\s*–\s*Chrome Web Store.*$/i, '')
        .replace(/\s*-\s*crxsoso.*$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function extractNameFromHTML(html) {
    if (!html) return null;

    // Try OpenGraph
    let m = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (m) return cleanTitle(m[1]);

    // Try <title>
    m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) return cleanTitle(m[1]);

    // Try H1
    m = html.match(/<h1[^>]*>([^<]{3,120})<\/h1>/i);
    if (m) return cleanTitle(m[1]);

    // Try plain text pattern
    m = html.match(/([^\n]+)\s*-\s*Chrome Web Store/i);
    if (m) return cleanTitle(m[1]);

    return null;
}
//
// function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS) {
//     return Promise.race([
//         fetch(url, { redirect: 'follow' }),
//         new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
//     ]);
// }
//
function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    // A browsery UA + Accept-Language slightly reduces interstitials and odd responses.
    const headers = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    return fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers,
    }).finally(() => clearTimeout(id));
}

async function resolveOne(id) {
    for (const src of SOURCES) {
        const url = src.url(id);
        try {
            const res = await fetchWithTimeout(url);
            if (!res.ok) continue;
            const text = await res.text();
            const name = extractNameFromHTML(text);
            if (name) {
                // Provide a human-readable link (strip proxy for convenience)
                const publicLink = url.replace('https://r.jina.ai/http://', 'http://');
                return {id, name, source: src.name, url: publicLink, status: 'ok'};
            }
        } catch (_) {
            // try next source
        }
    }
    return {id, name: '', source: '', url: '', status: 'not_found'};
}

async function resolveAll(allIds) {
    const results = [];
    for (let i = 0; i < allIds.length; i += PARALLEL) {
        const chunk = allIds.slice(i, i + PARALLEL);
        if (process.stdout.isTTY) {
            console.clear();
            console.log(`Resolving ${Math.min(i + PARALLEL, allIds.length)} / ${allIds.length} ...`);
        }
        const resolved = await Promise.all(chunk.map(resolveOne));
        results.push(...resolved);
        if (i + PARALLEL < allIds.length) await sleep(RATE_DELAY_MS);
    }
    return results;
}

function toCSV(rows) {
    // const header = ['id', 'name', 'source', 'url', 'status'];
    const header = ['url', 'name'];
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    return [header, ...rows.map(r => header.map(k => esc(r[k] ?? '')))].map(r => r.join(',')).join('\n');
}

function printTable(rows) {
    // Minimal pretty print without external deps
    // const cols = ['id', 'name', 'source', 'url', 'status'];
    // const cols = ['id', 'name'];
    const cols = ['name', 'status', 'url'];

    const widths = Object.fromEntries(cols.map(c => [c, Math.min(60, Math.max(c.length, ...rows.map(r => (r[c] || '').length)))]));
    const sep = '  ';
    const line = cols.map(c => c.padEnd(widths[c])).join(sep);
    console.log(line);
    console.log(cols.map(c => '-'.repeat(widths[c])).join(sep));
    for (const r of rows) {
        console.log(cols.map(c => String(r[c] || '').slice(0, widths[c]).padEnd(widths[c])).join(sep));
    }
}

// ---- RUN ----
(async () => {
    const results = await resolveAll(ids);
    if (OUTPUT_CSV) {
        process.stdout.write(toCSV(results) + '\n');
    } else {
        printTable(results);
        const ok = results.filter(r => r.status === 'ok').length;
        console.error(`\nResolved ${ok}/${results.length} extensions.`);
    }
})();