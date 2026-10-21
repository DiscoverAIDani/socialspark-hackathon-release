import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewText, CATEGORIES } from '../public/privacy.js';

const categoryTitles = text => reviewText(text).findings.map(x => x.category);

test('six distinct local privacy categories', () => {
  assert.deepEqual(CATEGORIES.map(x => x.id), ['location', 'absence', 'contact', 'children', 'account', 'combination']);
});
test('typical safe text receives no findings without claiming guaranteed safety', () => {
  const result = reviewText('Had a wonderful day with my family!');
  assert.equal(result.complete, true);
  assert.equal(result.status, 'clear');
  assert.equal(result.findings.length, 0);
});
test('unattended home, travel timing and combinations', () => {
  const result = reviewText("We're leaving Friday, and our house will be empty all week! My phone is 916-555-0198.");
  assert.ok(result.findings.some(f => f.category === 'absence'));
  assert.ok(result.findings.some(f => f.category === 'contact'));
  assert.ok(result.findings.some(f => f.category === 'combination'));
});
test('detects street address without sending data anywhere', () => {
  const result = reviewText('Come to 123 Main Street on Saturday.');
  assert.ok(result.findings.some(f => f.category === 'location' && f.sourceQuote.includes('123 Main Street')));
});
test('detects email, phone and identifying name', () => {
  const result = reviewText('My full name is Sarah Jones. Call 916-555-0198 or email sarah@example.com.');
  assert.ok(result.findings.some(f => f.title.includes('name')));
  assert.ok(result.findings.some(f => f.title.includes('phone')));
  assert.ok(result.findings.some(f => f.title.includes('email')));
});
test('detects child-school association', () => {
  assert.ok(categoryTitles('My daughter goes to Lincoln Elementary school every day.').includes('children'));
});
test('regression BYP-001: 8-year-old daughter, name and named school are flagged', () => {
  const post = 'My 8-year-old daughter Emma attends Lincoln Elementary School.';
  const result = reviewText(post);
  assert.equal(result.status, 'concerns');
  assert.ok(result.findings.some(f => f.category === 'children' && f.title === 'Possible child-school disclosure'), 'Must flag child linked to named school');
  assert.ok(result.findings.some(f => f.category === 'children' && f.title === 'Possible child-age disclosure'), 'Must flag child age before daughter');
  assert.equal(result.checks.find(c => c.id === 'children').concernCount, 2);
  for (const f of result.findings.filter(f => f.sourceQuote)) {
    assert.equal(post.slice(f.start, f.end), f.sourceQuote, 'Quoted evidence must match the post exactly');
  }
});

test('flags age-before-child with hyphens or spaces', () => {
  for (const post of [
    'Our 9-year-old son attends Maple Elementary School.',
    'My 7 year old daughter goes to Cedar Elementary School.',
    'My 10-year-old grandson attends Brookside School.'
  ]) {
    const result = reviewText(post);
    assert.ok(result.findings.some(f => f.category === 'children' && f.title === 'Possible child-school disclosure'), post);
    assert.ok(result.findings.some(f => f.category === 'children' && f.title === 'Possible child-age disclosure'), post);
  }
});

test('does not flag adult-age or unrelated school references as child disclosures', () => {
  const cases = [
    'My 28-year-old daughter Emma attends Lincoln Elementary School for work.',
    'Lincoln Elementary School is hosting a general community event.',
    'I visited a school fundraiser last weekend.'
  ];
  for (const post of cases) {
    assert.ok(!reviewText(post).findings.some(f => f.category === 'children'), post);
  }
});

test('detects account info and possible secrets', () => {
  assert.ok(categoryTitles('Bank account number: 123456789012.').includes('account'));
  assert.ok(categoryTitles('My password is SecretValue123').includes('account'));
});
test('regression BYP-002: bank account number with is must be flagged', () => {
  const post = 'My bank account number is 123456789012. Please send the payment there.';
  const result = reviewText(post);
  assert.equal(result.status, 'concerns');
  assert.equal(result.checks.find(c => c.id === 'account').concernCount, 1);
  const finding = result.findings.find(f => f.category === 'account');
  assert.ok(finding, 'Explicit bank account number must trigger warning');
  assert.match(finding.sourceQuote, /bank account number is 123456789012/i);
  assert.equal(post.slice(finding.start, finding.end), finding.sourceQuote);
});

test('detects common account labels and separators', () => {
  for (const post of [
    'Account number: 0012345678',
    'Checking acct # 123456789',
    'Routing number is 021000021',
    'Bank account 123456789012',
    'My card number is 4111 1111 1111 1111',
    'Debit card no. 4111-1111-1111-1111',
    'My savings account number equals 123456789012'
  ]) {
    assert.ok(reviewText(post).findings.some(f => f.category === 'account' && f.title.includes('account or routing')), post);
  }
});

test('does not flag unrelated long numbers as financial account details', () => {
  for (const post of [
    'My order number is 123456789012.',
    'Meeting ID: 123456789012',
    'The package tracking number is 123456789012',
    'The account profile was updated today.'
  ]) {
    assert.ok(!reviewText(post).findings.some(f => f.category === 'account'), post);
  }
});

test('short grouped numeric strings do not count as full financial identifiers', () => {
  for (const post of [
    'Bank account # 12-34-5',
    'Routing number is 1234',
    'Account is 12345'
  ]) {
    assert.ok(!reviewText(post).findings.some(f => f.category === 'account'), post);
  }
});

test('matching account evidence always quotes exact original text', () => {
  const text = 'Checking account number: 000123456789 is not safe to publish.';
  for (const f of reviewText(text).findings.filter(f => f.category === 'account')) {
    assert.equal(text.slice(f.start, f.end), f.sourceQuote);
  }
});

test('quotes are literal substrings of reviewed text', () => {
  const text = 'Our home will be empty all week, please call 916-555-0198.';
  const result = reviewText(text);
  for (const finding of result.findings) {
    if (finding.sourceQuote) assert.equal(text.slice(finding.start, finding.end), finding.sourceQuote);
  }
});
test('recognizes some unsupported-language posts as limited coverage', () => {
  const r = reviewText('Nos vamos de vacaciones el viernes. Nuestra casa estará vacía toda la semana.');
  assert.equal(r.complete, false);
  assert.equal(r.status, 'limited');
  assert.ok(r.limitations.length);
  assert.equal(reviewText('我们明天离开家').complete, false);
});
test('hidden zero-width character yields incomplete result and location', () => {
  const r = reviewText('Call me at 916-555-0\u200B198.');
  assert.equal(r.complete, false);
  assert.equal(r.hiddenCharacters.length, 1);
  assert.match(r.hiddenCharacters[0].codePoint, /U\+200B/);
});
test('does not mistake empty text for a risky post', () => {
  assert.deepEqual(reviewText('').findings, []);
});
test('returns a stable independent response for each text', () => {
  const a = reviewText('Call 916-555-0198');
  const b = reviewText('Lovely evening.');
  assert.ok(a.findings.length);
  assert.equal(b.findings.length, 0);
});

// BYP-003 regression: a name + workplace + city can be a significant
// combined identifying disclosure even if all other local categories are clear.
test('regression BYP-003: identifies full name linked to named workplace and city', () => {
  const post = 'My name is Sarah Miller. I work at Cedar Grove Dental in Sacramento.';
  const result = reviewText(post);
  const combination = result.findings.filter(f => f.category === 'combination');
  assert.equal(result.status, 'concerns');
  assert.equal(combination.length, 1, 'Only one actionable combination warning');
  assert.match(combination[0].title, /name, workplace and location/);
  assert.match(combination[0].sourceQuote, /Sarah Miller/);
  assert.match(combination[0].sourceQuote, /Cedar Grove Dental/);
  assert.match(combination[0].sourceQuote, /Sacramento/);
  assert.equal(result.checks.find(c => c.id === 'combination').concernCount, 1);
  assert.equal(post.slice(combination[0].start, combination[0].end), combination[0].sourceQuote);
});

test('detects common named workplace and multiword city variations', () => {
  for (const post of [
    'My name is Sarah Miller. I work for Acme in San Francisco.',
    'My full name is Sarah Miller. I am employed at Cedar Grove Dental in West Sacramento.',
    'I work at Cedar Grove Dental in Sacramento. My name is Sarah Miller.',
    'My name is Sarah Miller. I work at Big Care Dental in Los Angeles.'
  ]) {
    const result = reviewText(post);
    assert.ok(result.findings.some(f => f.category === 'combination' && f.title.includes('workplace')), post);
  }
});

test('does not infer a name-workplace-city combination from unrelated details', () => {
  for (const post of [
    'My name is Sarah Miller. I love Sacramento.',
    'My name is Sarah Miller. I work at Cedar Grove Dental.',
    'I work at Cedar Grove Dental in Sacramento.',
    'My name is Sarah Miller. I work at home in Sacramento.',
    'My name is Sarah Miller. She works at Cedar Grove Dental in Sacramento.',
    'My name is Sarah Miller. I work at a clinic in Sacramento.',
    'My name is Sarah Miller. My online order number is 123456789012.'
  ]) {
    assert.ok(!reviewText(post).findings.some(f => f.category === 'combination'), post);
  }
});

test('does not link employment and a name from separate paragraphs or distant prose', () => {
  for (const post of [
    'My name is Sarah Miller.\nI work at Cedar Grove Dental in Sacramento.',
    'My name is Sarah Miller. ' + 'I really enjoyed a nice afternoon. '.repeat(15) + 'I work at Cedar Grove Dental in Sacramento.'
  ]) {
    assert.ok(!reviewText(post).findings.some(f => f.category === 'combination' && f.title.includes('workplace')), post);
  }
});

test('BYP-003 keeps earlier age, account and travel detections intact', () => {
  assert.ok(reviewText('My 8-year-old daughter Emma attends Lincoln Elementary School.').findings.some(f => f.category === 'children'));
  assert.ok(reviewText('My bank account number is 123456789012.').findings.some(f => f.category === 'account'));
  assert.ok(reviewText("We're leaving Friday and our home will be empty all week!").findings.some(f => f.category === 'absence'));
  assert.ok(!reviewText('My order number is 123456789012.').findings.some(f => f.category === 'account'));
});
