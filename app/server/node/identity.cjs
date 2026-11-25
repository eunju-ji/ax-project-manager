/** Node OIDC/off Identity; crypto, cookies and rate limiting remain inside the OIDC connector. */
function createIdentity(auth,mode){return {identify:async req=>mode==='off'?{role:'admin',local:true}:auth.session(req)};}
module.exports={createIdentity};
