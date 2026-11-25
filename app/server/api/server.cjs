const {createServer,small}=require('../node/server.cjs');
if(require.main===module){try{const host=process.env.HOST||(process.env.AUTH_MODE==='oidc'?'0.0.0.0':'127.0.0.1');const {server}=createServer({host,reset:process.argv.includes('--reset')});server.listen(Number(process.env.PORT||8766),host,()=>console.log('AX server ready'));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={createServer,small};
