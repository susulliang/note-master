// Simulates the new whole-document line-pair sweep + classification guard
// against the real Salesforce page text an agent pasted (Sep 2026 sample).
import { readFileSync } from 'node:fs';

const FIELD_ALIASES = {
  caseNumber:/^(Case\s*Number|Case\s*#)$/i,caseOwner:/^Case\s*Owner$/i,status:/^Status$/i,
  subject:/^Subject$/i,accountName:/^(Account\s*Name|Account)$/i,contactName:/^Contact\s*Name$/i,
  customerName:/^(Name|Customer\s*Name)$/i,phone:/^(Phone|Contact\s*Number|Contact\s*Phone)$/i,
  email:/^(Email|Email\s*Address)$/i,address:/^Address$/i,city:/^City$/i,
  provinceState:/^(Province|State)$/i,postalCode:/^(Postal\s*Code|Zip)$/i,country:/^Country$/i,
  deebotModel:/^(AMR\s*Model\s*No\.?|Deebot\s*Model|Model)$/i,serialNumber:/^Serial\s*Number$/i,
  skuNumber:/^SKU(\s*Number)?$/i,issueType:/^Issue\s*Type$/i,
  detailedIssue:/^(Detailed\s*Issue\s*Description|Request\s*Description|Description)$/i,
  resolutionSummary:/^Resolution\s*Summary$/i,additionalNotes:/^Additional\s*Notes$/i,
  caseOrigin:/^Case\s*Origin$/i,brand:/^Brand$/i,phoneSurveyResult:/^Phone\s*Survey\s*Result$/i,
  escalationType:/^Escalation\s*Type$/i,purchasingChannel:/^Purchasing\s*Channel$/i,
  orderNumber:/^Order\s*Number$/i,purchaseDate:/^Purchase\s*Date$/i,caseTag:/^Case\s*Tag$/i,
  firstPendingTs:/^First\s*Pending\s*Timestamp$/i,lastPendingTs:/^Last\s*Pending\s*Timestamp$/i,
  mergedCaseIds:/^Merged\s*Cases?$/i,aiAgentNote:/^AI\s*Agent$/i,appVersion:/^appVersion$/i,
  phoneModel:/^model$/i,osVersion:/^systemVersion$/i,deviceTypeName:/^deviceTypeName$/i,
  marketName:/^marketName$/i,appDeviceBlock:/^App\s*Device\s*Info$/i
};
function clean(v){if(v==null)return'';return String(v).replace(/\u00a0/g,' ').replace(/\s+\n/g,'\n').replace(/[ \t]+/g,' ').trim();}
function assignOnce(o,k,v){const cv=clean(v);if(!cv)return;if(!o[k])o[k]=cv;}
function lines(t){return t.split(/\r?\n/).map(s=>s.replace(/\u00a0/g,' ').trim()).filter(s=>s.length);}
function isLabel(l){for(const p of Object.values(FIELD_ALIASES))if(p.test(l))return true;return false;}
function matchAlias(l){for(const [k,p] of Object.entries(FIELD_ALIASES))if(p.test(l))return k;return null;}
function valid(k,v){const s=clean(v);if(!s)return false;if(/^select\b/i.test(s))return false;if(/^(contact\s*taggings|is\s*un-?authorized\s*seller|merged\s*cases?\(?|help\s*contact\s*name)/i.test(s))return false;if(/^edit\b/i.test(s))return false;if(k==='appDeviceBlock')return false;if(/^issue\s*type\d/i.test(s)||matchAlias(s))return false;if((k==='contactNumber'||k==='phone'||k==='caseNumber'||k==='serialNumber')&&!/\d/.test(s))return false;if((k==='email'||k==='emailAddress')&&!s.includes('@'))return false;return true;}

const text = readFileSync(new URL('./sf-sample.txt', import.meta.url), 'utf8');
const acc = {};

// (0) line sweep (the new tier)
{const ls=lines(text);for(let i=0;i<ls.length-1;i+=1){const k=matchAlias(ls[i]);if(!k)continue;const nx=ls[i+1];if(isLabel(nx)&&matchAlias(nx))continue;if(!valid(k,nx))continue;assignOnce(acc,k,nx);}}

// (1) classification regex with the new guard
const cls=[];let cm;const classRe=/Issue\s*Type(\d+)\s*(Primary|Second)\s*Classification\s*\n\s*([^\n]+)/gi;
while((cm=classRe.exec(text))!==null){const v=clean(cm[3]);if(!v||/^issue\s*type\d/i.test(v)||matchAlias(v))continue;cls.push({n:cm[1],kind:cm[2].toLowerCase()==='primary'?'L1':'L2',value:v});}
if(cls.length){const parts=cls.filter(c=>c.value).sort((a,b)=>a.n.localeCompare(b.n)||(a.kind==='L1'?-1:1)).map(c=>c.value);if(parts.length)assignOnce(acc,'issueType',parts.join(' · '));for(const c of cls){if(c.n==='1')assignOnce(acc,c.kind==='L1'?'issueType1L1':'issueType1L2',c.value);else if(c.n==='2')assignOnce(acc,c.kind==='L1'?'issueType2L1':'issueType2L2',c.value);else if(c.n==='3')assignOnce(acc,c.kind==='L1'?'issueType3L1':'issueType3L2',c.value);}}

// name/address synthesis (same as the extractors)
if(!acc.customerName&&acc.contactName)acc.customerName=acc.contactName;
if(!acc.customerName&&acc.accountName)acc.customerName=acc.accountName;
if(!acc.contactNumber&&acc.phone)acc.contactNumber=acc.phone;
if(!acc.emailAddress&&acc.email)acc.emailAddress=acc.email;
if(!acc.deebotModel&&acc.model)acc.deebotModel=acc.model;
const parts2=[acc.address,acc.city,acc.provinceState,acc.postalCode,acc.country].map(clean).filter(Boolean);
if(parts2.length){const joined=parts2.filter((v,i,a)=>i===0||!a.slice(0,i).includes(v)).join(', ');assignOnce(acc,'shippingAddress',joined);}

const expected = {
  caseNumber: '04044258', customerName: 'Cong Ta', contactNumber: '+1 510 365 1598',
  email: 'congbangta2001@gmail.com', deebotModel: 'DEEBOT N20 PRO PLUS',
  serialNumber: 'E08A35582F1FPN2P0175', status: 'Open', caseOwner: 'Dezzy VII',
  brand: 'ecovacs', caseOrigin: 'Inbound Call', city: 'Salt Lake City',
  address: '765 North 400 West', provinceState: 'UT', postalCode: '84103',
  country: 'United States',
};
let pass = 0, fail = 0;
for (const [k, v] of Object.entries(expected)) {
  const got = acc[k];
  if (got === v) { pass += 1; }
  else { fail += 1; console.log(`FAIL ${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got)}`); }
}
// Garbage checks
const garbage = {
  phone: ['Minimize', '_'], issueType3L1: ['Issue Type3 Second Classification', 'AMR Model No.'],
  purchasingChannel: ['Select Purchasing Channel'], caseTag: ['Contact Taggings', 'Edit Case Tag'],
  caseNumber: ['04057968', 'ROBOTICSSupport'], detailedIssue: ['Edit Request Description'],
  escalationType: ['Edit Escalation Type'], contactName: ['Help Contact Name'],
};
for (const [k, bads] of Object.entries(garbage)) {
  for (const bad of bads) {
    if (acc[k] === bad) { fail += 1; console.log(`GARBAGE ${k}: ${JSON.stringify(bad)}`); }
  }
}
if (acc.issueType && /Issue Type3|AMR Model/i.test(acc.issueType)) { fail += 1; console.log('GARBAGE issueType composite:', acc.issueType); }
else if (acc.issueType === 'Aftersale-Service inquiry · Urging Return/Refund · Failure · Device offline after network setup') { pass += 1; }

console.log(`\n${pass} passed, ${fail} failed`);
console.log('\nCaptured fields:');
for (const [k, v] of Object.entries(acc).sort()) console.log(`  ${k}: ${String(v).slice(0, 70)}`);
process.exit(fail ? 1 : 0);
