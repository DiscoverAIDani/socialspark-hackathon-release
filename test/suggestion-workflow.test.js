import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FICTIONAL_POST, FICTIONAL_MASKED, loadFictionalSuggestion, inspectEditedSuggestion, approveManualApplication, restoreAppliedSuggestion } from '../public/suggestion-workflow.js';

const getDemo = () => loadFictionalSuggestion({original:FICTIONAL_POST,revision:2,maskedText:FICTIONAL_MASKED});
test('offline demo only accepts fixed fictional original and correctly masked text',()=>{
  const result = getDemo();
  assert.equal(result.valid,true);
  assert.equal(result.autoApply,false);
  assert.equal(result.analysis.findings[0].sourceQuote,'[PHONE_1]');
  assert.equal(result.analysis.suggestedPost,'Please contact me through a private message.');
  assert.equal(loadFictionalSuggestion({original:'Hello',revision:2,maskedText:FICTIONAL_MASKED}).valid,false);
  assert.equal(loadFictionalSuggestion({original:FICTIONAL_POST,revision:2,maskedText:FICTIONAL_POST}).valid,false);
  assert.equal(loadFictionalSuggestion({original:FICTIONAL_POST,revision:0,maskedText:FICTIONAL_MASKED}).valid,false);
});
test('safe local candidate can be revised manually before explicit apply',()=>{
  const inspect=inspectEditedSuggestion('Please send me a private message, thank you.');
  assert.equal(inspect.allowed,true);
  const accepted=approveManualApplication({original:FICTIONAL_POST,currentRevision:2,sourceRevision:2,sourceText:FICTIONAL_POST,candidate:'Please send me a private message, thank you.'});
  assert.equal(accepted.allowed,true);
  assert.equal(accepted.text,'Please send me a private message, thank you.');
});
test('newly introduced phone, account number, address, child school, or empty-home concern blocks candidate',()=>{
  for(const text of ['Call me at 415-555-0136.', 'My bank account number is 123456789012.', 'Come to 123 Main Street.', 'My 8-year-old daughter Emma attends Lincoln Elementary School.', 'Our house will be empty all week.']) {
    assert.equal(inspectEditedSuggestion(text).allowed,false,text);
  }
});
test('editing a suggestion cannot introduce unresolved placeholders',()=>{
  for(const text of ['Call [PHONE_1] for more details.', 'Please contact [someone].']){
    assert.equal(inspectEditedSuggestion(text).code,'unresolved-placeholder');
  }
});
test('suspicious controls, limited language, empty and oversized drafts block apply',()=>{
  assert.equal(inspectEditedSuggestion('Hello\u200Bworld').allowed,false);
  assert.equal(inspectEditedSuggestion('Nos vamos de vacaciones y nuestra casa estará vacía.').allowed,false);
  assert.equal(inspectEditedSuggestion('   ').allowed,false);
  assert.equal(inspectEditedSuggestion('x'.repeat(6001)).allowed,false);
});
test('stale suggestion cannot apply after revision or original text changes',()=>{
  let base={original:FICTIONAL_POST,currentRevision:2,sourceRevision:2,sourceText:FICTIONAL_POST,candidate:'Please message me privately.'};
  assert.equal(approveManualApplication({...base,currentRevision:3}).code,'outdated-suggestion');
  assert.equal(approveManualApplication({...base,original:'Different post'}).code,'outdated-suggestion');
});
test('undo restores exact previous post only from unchanged applied draft/revision',()=>{
  const snapshot={previousText:FICTIONAL_POST,appliedText:'Please message me privately.',appliedRevision:3};
  assert.equal(restoreAppliedSuggestion({currentText:snapshot.appliedText,currentRevision:3,snapshot}).text,FICTIONAL_POST);
  assert.equal(restoreAppliedSuggestion({currentText:'Edited by user',currentRevision:4,snapshot}).code,'undo-expired');
  assert.equal(restoreAppliedSuggestion({currentText:snapshot.appliedText,currentRevision:4,snapshot}).code,'undo-expired');
  assert.equal(restoreAppliedSuggestion({currentText:snapshot.appliedText,currentRevision:3,snapshot:null}).code,'undo-expired');
});
test('browser source never persists drafts or enables network scan', async()=>{
  const {readFileSync}=await import('node:fs');
  const app=readFileSync(new URL('../public/app.js', import.meta.url),'utf8');
  assert.equal(/\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bXMLHttpRequest\b|\beval\s*\(/.test(app),false);
  assert.match(app,/aiDemoCheck\.checked = false/);
  assert.match(app,/edited\(\); \/\/ Re-run checks/);
});

test('browser-facing modules served under restrictive CSP; private security files remain hidden', async()=>{
  const { createAppServer } = await import('../server.mjs');
  const server=createAppServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const name of ['suggestion-workflow.js','ai-response-validation.js']){
      const res=await fetch(`${origin}/${name}`);
      assert.equal(res.status,200);
      assert.match(res.headers.get('content-security-policy'),/connect-src 'none'/);
    }
    assert.equal((await fetch(`${origin}/security/ai-response-validation.mjs`)).status,404);
    assert.equal((await fetch(`${origin}/api/ai-scan`, {method:'POST',body:'fictional text'})).status,405);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});
