const fs = require('fs');
const s = fs.readFileSync('extension/background/background.js', 'utf8');
const lines = s.split('\n');
const bad = [];
const re = /function\s+\w+\s*\([^)]*\)\s*:\s*[A-Za-z<>[\]|"' ]+\s*\{|const\s+\w+\s*:\s*[A-Za-z<>[\]|"' ]+\s*=|:\s*(string|number|boolean|null|any|void)(\s*[,)=]|\s*$)|as\s+const\b|!\s*[;),]/;
lines.forEach((l, i) => {
  const t = l.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
  if (re.test(l)) bad.push((i + 1) + ': ' + t.slice(0, 100));
});
console.log(bad.join('\n'));
console.log('total suspicious:', bad.length);
