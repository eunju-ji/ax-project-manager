const {test}=require('node:test');
const assert=require('node:assert/strict');
const {open}=require('../repo/sqlite/index.cjs');
test('transaction rollback and expired tx capability',()=>{const db=open(':memory:');let cap;assert.throws(()=>db.tx(tx=>{cap=tx;tx.run("INSERT INTO workspaces(workspace_id,id,display_key) VALUES ('w','w','w')");throw Error('abort');}),/abort/);db.tx(tx=>assert.equal(tx.all('SELECT * FROM workspaces').length,0));assert.throws(()=>cap.all('SELECT 1'),/transaction/);db.close();});
