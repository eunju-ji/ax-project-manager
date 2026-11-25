const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..'),dest=path.join(__dirname,'dist');fs.mkdirSync(dest,{recursive:true});
// Explicit allowlist: never copy server/, credentials, .real, or source datasets.
for(const file of ['index.html','app.js','styles.css','src/model.js']){const to=path.join(dest,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
fs.mkdirSync(path.join(dest,'assets'),{recursive:true});for(const file of fs.readdirSync(path.join(root,'assets')))if(/^[\w-]+\.png$/.test(file))fs.copyFileSync(path.join(root,'assets',file),path.join(dest,'assets',file));
fs.writeFileSync(path.join(dest,'data.js'),'const AX_DATA = {projects:[],reviews:[],persons:[],folders:{},demoAsOf:"",demoNotice:""}; const AX_ASSETS = {};');
