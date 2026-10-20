(function(root){'use strict';
 const C={};
 C.round=(n,d=2)=>Math.round((Number(n)+Number.EPSILON)*10**d)/10**d;
 C.norm=(s)=>String(s||'').trim().toUpperCase();
 C.money=(n)=>Number(n||0).toLocaleString('ko-KR',{maximumFractionDigits:8});
 C.symbol=(s,market)=>{let v=C.norm(s);if(market==='KR'){const m=v.match(/(?:^|\s)(\d{1,6})$/);if(m)v=m[1].padStart(6,'0');else if(/^\d{1,6}$/.test(v))v=v.padStart(6,'0')}return v};
 C.today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
 C.validObserved=(s)=>C.validDate(s)&&s<=C.today();
 C.simpleKRW=(value)=>{if(!Number.isFinite(value))return '계산 보류';const neg=value<0?'−':'';const n=Math.round(Math.abs(value));const e=Math.floor(n/100000000),m=Math.floor(n%100000000/10000),r=n%10000;const parts=[];if(e)parts.push(e.toLocaleString('ko-KR')+'억');if(m)parts.push(m.toLocaleString('ko-KR')+'만');if(r||!parts.length)parts.push(r.toLocaleString('ko-KR'));return neg+parts.join(' ')+'원'};
 C.validDate=(s)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s};
 C.safeUrl=(s)=>{try{const u=new URL(String(s));return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
 C.uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,9);
 C.calc=function(transactions, quotes, fx){
  const holdings={},cash={},realized=[],errors=[],warnings=[];
  const ids=new Set();
  const sorted=[...transactions].sort((a,b)=>String(a.date).localeCompare(String(b.date))||(Number(a.seq||0)-Number(b.seq||0)));
  for(const t of sorted){
   const account=String(t.account||'기본계좌').trim(),type=t.type,curr=t.currency|| (t.market==='US'?'USD':'KRW');
   const ck=account+'|'+curr;
   const cashDelta=(amount,currency=curr)=>{const k=account+'|'+currency;cash[k]=(cash[k]||0)+amount;};
   const symbol=C.norm(t.symbol),key=account+'|'+t.market+'|'+symbol;
   const h=holdings[key]||(holdings[key]={account,market:t.market,symbol,qty:0,costNative:0,costKRW:0,realizedNative:0});
   const qty=Number(t.qty||0),price=Number(t.price||0),fee=Number(t.fee||0),tax=Number(t.tax||0),rate=curr==='KRW'?1:Number(t.fx||0);
   try{
    if(!C.validObserved(t.date))throw Error('실제로 존재하는 과거 또는 오늘 날짜를 입력하세요');
    if(t.id){if(ids.has(t.id))throw Error('중복 거래 ID');ids.add(t.id)}
    if(['buy','sell','split'].includes(type)&&t.currency&&t.currency!==(t.market==='US'?'USD':'KRW'))throw Error('시장과 통화가 맞지 않습니다');
    if(!Number.isFinite(qty)||!Number.isFinite(price)||!Number.isFinite(fee)||!Number.isFinite(tax)||!Number.isFinite(Number(t.amount||0))||!Number.isFinite(Number(t.fx||0)))throw Error('숫자 입력값 오류');
    if(['buy','sell'].includes(type)){
     if(!symbol||!['KR','US'].includes(t.market)||qty<=0||price<=0||fee<0||tax<0||rate<=0)throw Error('매매 입력값 오류');
     const gross=qty*price;
     if(type==='buy'){
      const spend=gross+fee+tax; h.qty+=qty;h.costNative+=spend;h.costKRW+=spend*rate;cashDelta(-spend);
     }else{
      if(h.qty+1e-8<qty)throw Error('보유 수량보다 많은 매도');
      const removedN=h.costNative*qty/h.qty,removedK=h.costKRW*qty/h.qty;
      const proceeds=gross-fee-tax;
      h.qty-=qty;h.costNative-=removedN;h.costKRW-=removedK;
      if(h.qty<1e-8){h.qty=0;h.costNative=0;h.costKRW=0;}
      h.realizedNative+=proceeds-removedN;
      realized.push({date:t.date,account,symbol,market:t.market,pnlNative:proceeds-removedN,pnlKRW:proceeds*rate-removedK});
      cashDelta(proceeds);
     }
    }else if(type==='split'){
     if(!symbol||qty<=0||h.qty<=0)throw Error('분할 전 보유 수량 또는 배율 오류');
     h.qty*=qty;
    }else if(type==='dividend'){
     const amount=Number(t.amount||0);if(amount<0||tax<0||tax>amount)throw Error('배당금보다 세금이 많거나 배당 입력값이 잘못되었습니다');cashDelta(amount-tax);
    }else if(type==='deposit'||type==='withdraw'){
     const amount=Number(t.amount||0);if(amount<=0)throw Error('입출금 금액 오류');cashDelta(type==='deposit'?amount:-amount);
    }else if(type==='fx_buy'||type==='fx_sell'){
     const amount=Number(t.amount||0),r=Number(t.fx||0);if(amount<=0||r<=0||fee<0)throw Error('환전 입력값 오류');
     // amount = USD units; fx_buy KRW->USD, fx_sell USD->KRW. Fee is KRW.
     cashDelta(type==='fx_buy'?amount:-amount,'USD');cashDelta(type==='fx_buy'?-(amount*r+fee):amount*r-fee,'KRW');
    }else if(type==='fee'){
     const amount=Number(t.amount||0);if(amount<=0)throw Error('비용 오류');cashDelta(-amount);
    }else throw Error('알 수 없는 거래 유형');
   }catch(e){errors.push(`${t.date||'?'} ${symbol||type}: ${e.message}`);}
  }
  for(const [k,v] of Object.entries(cash)){if(v < -0.005)warnings.push('현금 잔액 확인 필요: '+k+' ('+C.money(v)+')');}
  const positions=Object.values(holdings).filter(h=>h.qty>1e-8).map(h=>{
   const q=quotes[h.market+'|'+h.symbol],latest=q&&Number(q.price),f=h.market==='US'?Number(fx.rate||0):1;
   const valid=!!(latest>0&&Number.isFinite(latest)&&f>0&&Number.isFinite(f)&&C.validObserved(q?.date)&&q.date>=sorted.find(t=>t.market===h.market&&C.norm(t.symbol)===h.symbol&&t.account===h.account&&t.type==='buy')?.date&&(h.market!=='US'||C.validObserved(fx.date)));
   const current=valid?h.qty*latest:null, valueKRW=valid?current*f:null;
   const priceEffect=valid?(current-h.costNative)*(h.costKRW/h.costNative||f):null;
   const fxEffect=valid?current*(f-(h.costKRW/h.costNative||f)):null;
   return {...h,price:valid?latest:null,valueNative:current,valueKRW,unrealizedKRW:valid?valueKRW-h.costKRW:null,priceEffect,fxEffect,quoteDate:q?.date||'',fxDate:h.market==='US'?fx.date||'':null};
  });
  return {positions,cash,realized,errors,warnings};
 };
 C.validateTransaction=(t,transactions)=>{
  if(!C.validObserved(t.date))return '실제로 존재하는 오늘 이전 거래 날짜를 입력하세요.';
  if(t.id&&transactions.some(x=>x.id===t.id))return '같은 거래 번호가 이미 있습니다.';
  if(['buy','sell','split'].includes(t.type)&&t.currency&&t.currency!==(t.market==='US'?'USD':'KRW'))return '시장과 통화가 맞지 않습니다.';
  if(!t.account?.trim())return '계좌 이름을 입력하세요.';
  if(['buy','sell','split'].includes(t.type)&&(!C.norm(t.symbol)||!['KR','US'].includes(t.market)))return '시장과 종목코드를 입력하세요.';
  const next=C.calc([...transactions,t],{},{});
  const prior=C.calc(transactions,{},{}).errors;
  const introduced=next.errors.find(v=>!prior.includes(v));
  return introduced||'';
 };
 C.esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 root.CompassCore=C;
 if(typeof module!=='undefined'&&module.exports)module.exports=C;
})(typeof window!=='undefined'?window:globalThis);
