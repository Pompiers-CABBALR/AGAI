const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

for (const file of ['modules/08-interventions-js.js', 'app.js']) {
  test(`${file}: les interventions terminées suivent le jour de la dernière clôture`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const start = source.indexOf('function interventionIsClosureTimelineEntry(');
    const end = source.indexOf('function interventionCompactStampMillis(', start);
    assert.ok(start >= 0 && end > start);
    const context = {};
    vm.runInNewContext(source.slice(start, end)
      + '\nglobalThis.closedOnDay=interventionWasClosedOnDay;', context);

    const priorCall = { s: 'terminee', h: '20261016_2310',
      tl: [{ s: 'terminee', h: '20261017_0030' }] };
    assert.equal(context.closedOnDay(priorCall, '20261017'), true);
    assert.equal(context.closedOnDay(priorCall, '20261016'), false);

    const latestClosure = { s: 'terminee', h: '20261016_2310', tl: [
      { s: 'terminee', h: '20261017_0030' },
      { s: 'terminee', h: '20261018_0110' }
    ] };
    assert.equal(context.closedOnDay(latestClosure, '20261017'), false);
    assert.equal(context.closedOnDay(latestClosure, '20261018'), true);

    const recalled = { s: 'terminee', h: '20261016_2310', tl: [
      { s: 'terminee', h: '20261016_2350' },
      { s: 'terminee', h: '20261017_1000', note: 'Rappel du requérant' }
    ] };
    assert.equal(context.closedOnDay(recalled, '20261017'), false);
    assert.equal(context.closedOnDay(recalled, '20261016'), true);

    assert.equal(context.closedOnDay({ s: 'terminee', h: '20261017_0900' }, '20261017'), true);
    assert.equal(context.closedOnDay({ s: 'en-cours', h: '20261017_0900' }, '20261017'), false);

    assert.match(source, /const currentDay=getDS\(N\(\)\);[\s\S]*?const isTermAuj=iv=>interventionWasClosedOnDay\(iv,currentDay\)/);
    assert.doesNotMatch(source, /list=list\.filter\(iv=>iv\.s!=='terminee'\|\|isTdy\(iv\)\)/);
  });
}

test('le sous-onglet PILP applique le même jour de clôture', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'modules/09-pilp-js.js'), 'utf8');
  assert.match(source, /const currentDay=getDS\(N\(\)\)/);
  assert.match(source, /iv\.s==='terminee'\?pilpTermineeAujourdhui\(iv\)/);
});
