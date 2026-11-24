
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
test('local Git indexes commits on all branches, excludes merges and strips credentials',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ax-local-git-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repo=path.join(root,'demo');fs.mkdirSync(repo);
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_CONFIG_GLOBAL:path.join(root,'no-config'),GIT_CONFIG_NOSYSTEM:'1'}});
 git('init','-b','main');git('config','user.email','synthetic@example.test');git('config','user.name','Synthetic');
 fs.writeFileSync(path.join(repo,'a.txt'),'PRIVATE_BODY');git('add','.');git('commit','-m','first');
 const first=git('rev-parse','HEAD').trim();git('checkout','-b','feature');
 fs.writeFileSync(path.join(repo,'b.txt'),'PRIVATE_BODY');git('add','.');git('commit','-m','second');
 const second=git('rev-parse','HEAD').trim();git('checkout','main');git('merge','--no-ff','feature','-m','merge excluded');
 git('remote','add','origin','https://user:SECRET@example.test/org/demo.git?token=SECRET#SECRET');
 const {collectLocalGit}=require('../real/collect-local-git.cjs');
 const r=await collectLocalGit({repos:[repo]});
 a.deepEqual(r.errors,[]);a.equal(r.items.length,2);a.deepEqual(new Set(r.items.map(i=>i.id)),new Set([first,second]));
 for(const i of r.items){a.equal(i.kind,'commit');a.equal(i.repo,'demo');a.equal(i.files_changed,1);a.equal(i.remote,'example.test/org/demo.git');a.ok(i.at);}
 a.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY|SECRET|user:|a\.txt|b\.txt/);
 a.equal((await collectLocalGit({repos:[repo],author:'absent@example.test'})).items.length,0);
 a.equal((await collectLocalGit({repos:[repo],author:'Synthetic'})).items.length,2);
 a.equal((await collectLocalGit({repos:[repo],since:'2099-01-01T00:00:00Z'})).items.length,0);
 a.deepEqual((await collectLocalGit({repos:[repo],since:'invalid'})).errors,['invalid_since']);
 const bad=await collectLocalGit({repos:[path.join(root,'missing')]});a.deepEqual(bad.errors,['git_read_failed']);a.deepEqual(bad.items,[]);
});
test('remote normalization excludes local paths and handles SSH credentials',()=>{
 const {sanitizeRemote}=require('../real/collect-local-git.cjs');
 a.equal(sanitizeRemote('git@example.test:org/repo.git'),'example.test/org/repo.git');
 a.equal(sanitizeRemote('ssh://user:SECRET@example.test/org/repo.git'),'example.test/org/repo.git');
 a.equal(sanitizeRemote('C:/private/repo'),null);a.equal(sanitizeRemote('/private/repo'),null);
});
