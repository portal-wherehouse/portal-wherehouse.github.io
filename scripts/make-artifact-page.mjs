// Turns the single-file preview build into a page fragment for hosts that supply their own
// document skeleton: drops the doctype and the html/head/body wrapper tags, keeps everything else.
import { readFileSync, writeFileSync } from 'node:fs';

const [src = 'dist-artifact/index.html', out = 'dist-artifact/pallet-locator.html'] = process.argv.slice(2);
let html = readFileSync(src, 'utf8');
const head = html.indexOf('<script');
const skeleton = [/<!doctype html>\s*/i, /<html[^>]*>\s*/i, /<head>\s*/i, /<\/head>\s*/i, /<body>\s*/i, /<\/body>\s*/i, /<\/html>\s*/i];
// Only strip wrapper tags outside the inlined script and style, which start at the first <script.
let before = html.slice(0, head);
let after = html.slice(head);
for (const re of skeleton.slice(0, 3)) before = before.replace(re, '');
const tailStart = after.lastIndexOf('</style>');
let tail = after.slice(tailStart);
for (const re of skeleton.slice(3)) tail = tail.replace(re, '');
html = before.trimStart() + after.slice(0, tailStart) + tail.trimEnd() + '\n';
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB, title at byte ${html.indexOf('<title>')}`);
