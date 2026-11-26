const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('only related resource cards may truncate titles and metadata',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');a.doesNotMatch(css,/word-break\s*:\s*break-all|overflow-wrap\s*:\s*anywhere/);
 // 사용자 요청 예외: 관련 자료 카드 제목 2줄, 출처·날짜 1줄 말줄임.
 for(const [,selector,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  if(/text-overflow\s*:\s*ellipsis|(?:-webkit-)?line-clamp\s*:/.test(body))for(const part of selector.split(','))a.match(part.trim(),/^(\.gantt-resources \.source-info (strong|small)|\.week-board-card strong)$/);
 }
 a.match(css,/\.gantt-resources \.source-info strong\{[^}]*-webkit-line-clamp:2/);a.match(css,/word-break:\s*keep-all/);a.match(css,/overflow-wrap:\s*break-word/);
});
test('font sizes use the shared scale and weights use 400, 500 or 700',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');a.ok(css.includes('--t7:20px'));for(const m of css.matchAll(/font-size\s*:\s*([^;}]+)/g))a.match(m[1],/^var\(--t[1-7]\)$/);for(const m of css.matchAll(/font-weight\s*:\s*([^;}]+)/g))a.match(m[1],/^(400|500|700)$/);
});
