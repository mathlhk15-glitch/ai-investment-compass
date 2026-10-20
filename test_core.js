const assert=require('node:assert/strict');const C=require('./core.js');
let n=0;function test(name,fn){fn();n++;console.log('PASS',name)}
const t=(type,date,market='KR',symbol='AAA',qty=0,price=0,fx=1,amount=0,fee=0,tax=0)=>({type,date,market,symbol,qty,price,fx,amount,fee,tax,account:'T',currency:market==='US'?'USD':'KRW'});
test('multiple buys weighted average and partial sell',()=>{const ts=[t('buy','2026-01-01','KR','AAA',10,100),t('buy','2026-01-02','KR','AAA',10,200),t('sell','2026-01-03','KR','AAA',5,250)];const d=C.calc(ts,{'KR|AAA':{price:210,date:'2026-01-04'}},{rate:0});assert.equal(d.errors.length,0);assert.equal(d.positions[0].qty,15);assert.equal(d.positions[0].costKRW,2250);assert.equal(d.realized[0].pnlKRW,500);assert.equal(d.positions[0].unrealizedKRW,900);});
test('FX price and currency effects exact decomposition',()=>{const d=C.calc([t('buy','2026-01-01','US','DEMO',10,100,1300)],{'US|DEMO':{price:110,date:'2026-01-04'}},{rate:1200,date:'2026-01-04'});const h=d.positions[0];assert.equal(h.costKRW,1300000);assert.equal(h.valueKRW,1320000);assert.equal(h.unrealizedKRW,20000);assert.equal(h.priceEffect,130000);assert.equal(h.fxEffect,-110000);assert.equal(h.priceEffect+h.fxEffect,h.unrealizedKRW);});
test('split preserves acquisition cost',()=>{const d=C.calc([t('buy','2026-01-01','KR','AAA',10,100),t('split','2026-01-02','KR','AAA',2)],{'KR|AAA':{price:50}},{rate:0});assert.equal(d.positions[0].qty,20);assert.equal(d.positions[0].costNative,1000)});
test('disallow sell more than holdings',()=>{assert.match(C.validateTransaction(t('sell','2026-01-01','KR','AAA',2,100),[]),/보유 수량/)});
test('dividend net tax and currency conversion',()=>{const a=t('dividend','2026-01-01','US','AAA',0,0,1,100,0,15);const d=C.calc([a],{},{});assert.equal(d.cash['T|USD'],85);});
test('FX exchange cash flows',()=>{const d=C.calc([t('fx_buy','2026-01-01','KR','',0,0,1350,100,1000)],{},{});assert.equal(d.cash['T|USD'],100);assert.equal(d.cash['T|KRW'],-136000);});
test('cash deposit and withdrawal not counted as profit',()=>{const d=C.calc([t('deposit','2026-01-01','KR','',0,0,1,10000),t('withdraw','2026-01-02','KR','',0,0,1,2000)],{},{});assert.equal(d.cash['T|KRW'],8000);assert.equal(d.realized.length,0);});
test('quote missing does not turn into false zero valuation',()=>{const d=C.calc([t('buy','2026-01-01','KR','AAA',1,100)],{},{});assert.equal(d.positions[0].valueKRW,null);});
test('fees folded into basis and net proceeds',()=>{const d=C.calc([t('buy','2026-01-01','KR','AAA',1,100,1,0,2),t('sell','2026-01-02','KR','AAA',1,120,1,0,3,1)],{},{});assert.equal(d.realized[0].pnlKRW,14);});
// Consolidated pass count printed at end.
test('reject nonexistent date',()=>assert.match(C.validateTransaction(t('buy','2026-99-99','KR','AAA',1,100),[]),/존재/));
test('cash overdraft is warning not accounting corruption',()=>{const r=C.calc([t('buy','2026-01-01','KR','AAA',1,100)],{},{});assert.equal(r.errors.length,0);assert.ok(r.warnings.some(s=>s.includes('현금 잔액')))});
test('reject unsafe link scheme',()=>{assert.equal(C.safeUrl('javascript:alert(1)'),'');assert.ok(C.safeUrl('https://example.org/page'))});
test('reject invalid trade quantity',()=>{assert.match(C.validateTransaction(t('buy','2026-01-01','KR','AAA',-1,100),[]),/매매 입력값/)});
test('reject impossible month end',()=>assert.equal(C.validDate('2026-02-30'),false));
test('split sell ordering',()=>{const v=C.calc([t('buy','2026-01-01','KR','AAA',10,100),t('split','2026-01-02','KR','AAA',2),t('sell','2026-01-03','KR','AAA',5,60)],{},{});assert.equal(v.errors.length,0);assert.equal(v.positions[0].qty,15)});
test('market currency mismatch rejected',()=>{const q=t('buy','2026-01-01','US','DEMO',1,100,1300);q.currency='KRW';assert.match(C.validateTransaction(q,[]),/통화/);});
test('duplicate transaction ID rejected',()=>{const a=t('buy','2026-01-01','KR','AAA',1,100);a.id='same';const b={...a,date:'2026-01-02'};assert.match(C.validateTransaction(b,[a]),/거래 번호/);});
test('dividend tax greater than amount rejected',()=>{const a=t('dividend','2026-01-01','KR','',0,0,1,10,0,100);assert.ok(C.calc([a],{},{}).errors.some(e=>e.includes('배당금보다')))});
test('stale or invalid quote date prevents valuation',()=>{const d=C.calc([t('buy','2026-01-04','KR','AAA',1,100)],{'KR|AAA':{price:120,date:'2026-01-01'}},{});assert.equal(d.positions[0].valueKRW,null);});
test('korean money boundary exact',()=>{assert.equal(C.simpleKRW(100000000),'1억원');assert.equal(C.simpleKRW(199995000),'1억 9,999만 5,000원')});
test('small quantity display precision survives in ledger engine',()=>{const d=C.calc([t('buy','2026-01-01','KR','AAA',0.001,1000)],{'KR|AAA':{price:1000,date:'2026-01-02'}},{});assert.equal(d.positions[0].qty,0.001)});
console.log(`TOTAL ${n} tests passed`);
