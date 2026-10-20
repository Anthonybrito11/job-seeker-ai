const { test } = require('node:test');const assert = require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
test('message and target values cannot inject HTML into the hosted panel',()=>{
 const html=fs.readFileSync('scripts/templates/dashboard.html','utf8');
 const code=html.slice(html.indexOf('const STAGE_INFO'),html.indexOf('let dashboardLoaded'));
 const context=vm.createContext({document:{querySelector:()=>null}});vm.runInContext(code,context);
 const output=vm.runInContext(`renderMessages([{sender:'<script>bad</script>',subject:'<img src=x onerror=bad>',status:'sent\" onclick=bad',channel:'gmail'}]) + renderTargets({'<img src=x>':1})`,context);
 assert.ok(!output.includes('<script>'));assert.ok(!output.includes('<img src=x'));
 assert.ok(output.includes('st-pending'));assert.ok(output.includes('&lt;img'));
});
test('static dashboard source does not contain candidate or server secrets',()=>{
 const html=fs.readFileSync('scripts/templates/dashboard.html','utf8');
 assert.ok(!html.includes('postgres://'));assert.ok(!html.includes('postgresql://'));
 assert.ok(!html.includes('GOOGLE_CLIENT_SECRET'));assert.ok(!html.includes('DASHBOARD_SESSION_SECRET'));
});
