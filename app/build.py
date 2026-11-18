"""Compile TypeScript and create an offline HTML without modifying baseline/."""
from pathlib import Path
import argparse,base64,json,shutil,subprocess

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--skip-compile',action='store_true',help='Package an already compiled app.js')
parser.add_argument('--typescript',help='Explicit path to TypeScript lib/tsc.js')
args=parser.parse_args()
if not args.skip_compile:
 local=root/'node_modules/typescript/lib/tsc.js'
 if args.typescript or local.exists():
  command=['node',args.typescript or str(local)]
 else:
  executable=shutil.which('tsc')
  if not executable:
   raise SystemExit('TypeScript compiler missing. Run npm install, or pass --typescript PATH_TO_TSC_JS.')
  command=[executable]
 subprocess.run(command+['src/app.ts','--target','ES2022','--module','none','--lib','ES2022,DOM','--strict','--skipLibCheck','--outFile','app.js'],check=True,cwd=root)
data=json.loads((root/'data.json').read_text(encoding='utf-8'))
(root/'data.js').write_text('const AX_DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\nconst AX_ASSETS = {};\n',encoding='utf-8')
assets={p.stem:'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode() for p in sorted((root/'assets').glob('*.png'))}
data_js=(root/'data.js').read_text(encoding='utf-8').replace('const AX_ASSETS = {};','const AX_ASSETS = '+json.dumps(assets,separators=(',',':'))+';')
script='\n'.join([data_js,(root/'src/model.js').read_text(encoding='utf-8'),(root/'app.js').read_text(encoding='utf-8')]).replace('</script','<\\/script')
html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AX 프로젝트 관리장 · 팀 업무 기록</title><style>'+(root/'styles.css').read_text(encoding='utf-8')+'</style></head><body data-theme="linear"><a class="skip-link" href="#main">본문으로 건너뛰기</a><div id="app"></div><script>'+script+'</script></body></html>'
html=html.replace('<body data-theme="linear">','<body data-theme="linear" data-initial-theme="linear-notion">',1)
out=root.parent/'preview'/'AX_Project_Manager.html'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(html,encoding='utf-8')
print('Offline preview:',out)
