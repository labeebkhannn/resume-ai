const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');

function readUsers() { try { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch { return []; } }
function saveUsers(users) { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir); fs.writeFileSync(usersFile, JSON.stringify(users, null, 2)); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') }; }
function sendJson(res, code, value) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }

const skillKeywords = [
  'javascript', 'python', 'java', 'react', 'node', 'sql', 'html', 'css', 'excel',
  'aws', 'azure', 'figma', 'communication', 'leadership', 'project management',
  'data analysis', 'marketing', 'sales', 'customer service', 'machine learning'
];
const actionVerbs = ['achieved', 'built', 'created', 'delivered', 'developed', 'improved', 'increased', 'led', 'managed', 'optimized', 'reduced', 'launched', 'designed'];

function analyzeResume(text, role) {
  const content = (text || '').toLowerCase();
  const words = content.trim().split(/\s+/).filter(Boolean);
  const foundSkills = skillKeywords.filter(skill => content.includes(skill));
  const foundVerbs = actionVerbs.filter(verb => content.includes(verb));
  const hasEmail = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text);
  const hasPhone = /(\+?\d[\d\s().-]{7,}\d)/.test(text);
  const hasNumbers = /\b\d+(?:\.\d+)?[%+]?\b/.test(text);
  const roleWords = (role || '').toLowerCase().split(/\W+/).filter(word => word.length > 3);
  const matchedRoleWords = roleWords.filter(word => content.includes(word));
  let score = 36;
  score += Math.min(foundSkills.length * 5, 25);
  score += Math.min(foundVerbs.length * 3, 15);
  score += hasEmail ? 5 : 0;
  score += hasPhone ? 4 : 0;
  score += hasNumbers ? 8 : 0;
  score += Math.min(matchedRoleWords.length * 4, 12);
  score += words.length >= 180 && words.length <= 850 ? 5 : 0;
  score = Math.min(score, 98);

  const suggestions = [];
  if (!hasNumbers) suggestions.push('Add measurable results, such as “increased engagement by 24%”, to show your impact.');
  if (foundVerbs.length < 3) suggestions.push('Start experience bullets with action verbs like Developed, Led, Optimized, or Delivered.');
  if (foundSkills.length < 4) suggestions.push('Include more relevant technical and workplace skills from the job description.');
  if (!hasEmail || !hasPhone) suggestions.push('Make sure your contact section includes both a professional email and phone number.');
  if (words.length < 180) suggestions.push('Your resume looks brief. Add detail to your strongest projects and work experience.');
  if (!suggestions.length) suggestions.push('Great foundation. Tailor your summary and skills to every specific job description.');

  return {
    score,
    keywords: foundSkills.length ? foundSkills : ['communication', 'problem solving', 'teamwork'],
    strengths: [
      foundSkills.length ? `${foundSkills.length} relevant skills detected` : 'Clear, readable resume structure',
      hasNumbers ? 'Achievement-focused metrics found' : 'Ready for quantified achievements',
      matchedRoleWords.length ? `Tailored to the ${role || 'selected'} role` : 'Suitable for tailoring to a target role'
    ],
    suggestions: suggestions.slice(0, 3)
  };
}

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.method === 'POST' && (req.url === '/api/auth/register' || req.url === '/api/auth/login')) {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        const { email = '', password = '' } = JSON.parse(data || '{}');
        const normalizedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return sendJson(res, 400, { error: 'Enter a valid email address.' });
        if (password.length < 6) return sendJson(res, 400, { error: 'Use a password with at least 6 characters.' });
        const users = readUsers(); const existing = users.find(user => user.email === normalizedEmail);
        if (req.url.endsWith('/register')) {
          if (existing) return sendJson(res, 409, { error: 'An account already exists for this email. Please log in.' });
          const secured = hashPassword(password); users.push({ email: normalizedEmail, ...secured, createdAt: new Date().toISOString() }); saveUsers(users);
          return sendJson(res, 201, { email: normalizedEmail });
        }
        if (!existing) return sendJson(res, 404, { error: 'No account found for this email. Please create one first.' });
        const attempt = hashPassword(password, existing.salt);
        if (!crypto.timingSafeEqual(Buffer.from(attempt.hash, 'hex'), Buffer.from(existing.hash, 'hex'))) return sendJson(res, 401, { error: 'Incorrect password. Please try again.' });
        return sendJson(res, 200, { email: normalizedEmail });
      } catch { return sendJson(res, 400, { error: 'Please enter your account details again.' }); }
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/analyze') {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        const body = JSON.parse(data || '{}');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(analyzeResume(body.resume, body.role)));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Please send valid resume information.' }));
      }
    });
    return;
  }
  const requested = req.url === '/' ? 'index.html' : req.url.replace(/^\//, '');
  const file = path.join(publicDir, requested);
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`AI Resume Analysis is running at http://localhost:${PORT}`));
