/**
 * Ports return Promises; implementations must never leak platform handles into core.
 * @typedef {Object} Storage
 * @property {function():Promise<Object>} view Read a projected snapshot.
 * @property {function(Object):Promise<Object>} decide Atomic judgment + audit + idempotency.
 * @property {function(Object,string):Promise<Object>} correct Atomic human correction with actor, version and history.
 * @property {function(Object,Object):Promise<Object>} applyDelta Atomic dataset/state/audit transaction; dryRun never persists.
 * @property {function(string):Promise<Object|null>} getUser Lookup invited/active user by normalized email.
 * @property {function(Object):Promise<void>} saveUser Persist role/status changes.
 * @property {function(string):Promise<Object|null>} getSession Read a session.
 * @property {function(string,Object):Promise<void>} saveSession Persist or revoke session (null).
 * @property {function(string):Promise<Object|null>} getToken Lookup non-revoked SHA-256 collection token with role and person_id.
 * @property {function(string,Object):Promise<void>} saveToken Persist or revoke token (null).
 * @property {function(string,string):Promise<void>} audit Append action/actor only, never payload or credentials.
 * @property {function(string,Array):Promise<Object>} putInbox Atomically append deduplicated indexes attributed to token owner.
 * @property {function(string):Promise<Object>} getInbox Read after monotonic cursor; return {records,cursor}.
 * @typedef {Object} Identity
 * @property {function(Request):Promise<Object|null>} identify Identify and enforce invitation/status; no authorization from unsigned headers.
 * @typedef {Object} Http
 * @property {function(*):Promise<Request>} request Convert native request, preserving raw target validation.
 * @property {function(Response,*):Promise<void>} respond Convert core response to native response.
 */
module.exports={};
