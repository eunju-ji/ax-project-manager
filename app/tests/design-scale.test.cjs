const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('text wrapping never splits words indiscriminately or truncates titles',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');a.doesNotMatch(css,/word-break\s*:\s*break-all|overflow-wrap\s*:\s*anywhere|text-overflow\s*:\s*ellipsis/);a.match(css,/word-break:\s*keep-all/);a.match(css,/overflow-wrap:\s*break-word/);
});
test('font sizes use the shared scale and weights use 400, 500 or 700',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');a.ok(css.includes('--t7:20px'));for(const m of css.matchAll(/font-size\s*:\s*([^;}]+)/g))a.match(m[1],/^var\(--t[1-7]\)$/);for(const m of css.matchAll(/font-weight\s*:\s*([^;}]+)/g))a.match(m[1],/^(400|500|700)$/);
});
