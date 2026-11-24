const state = { exam: null, key: new Map(), values: {}, checked: {}, duration: 25 * 60, clockStarted: Date.now() };
const $ = (s, root = document) => root.querySelector(s);
const norm = value => String(value ?? '').toLowerCase().normalize('NFKD').replace(/[×]/g, 'x').replace(/[µμ]/g, 'u').replace(/[^a-z0-9.]+/g, ' ').trim().replace(/\s+/g, ' ');

async function init() {
  const [examData, keyData] = await Promise.all([fetch('./questions.json').then(r => r.json()), fetch('./answers.json').then(r => r.json())]);
  state.exam = examData.exam;
  keyData.answers.forEach(answer => state.key.set(answer.id, answer));
  const saved = JSON.parse(localStorage.getItem('biol108-attempt') || '{}');
  state.values = saved.values || {};
  state.checked = saved.checked || {};
  render(); updateProgress(); updateScore();
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  $('#check-all').addEventListener('click', () => { state.exam.stations.forEach(station => station.questions.forEach(q => checkQuestion(q.id))); updateScore(); document.querySelector('.score-card').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('#reset-btn').addEventListener('click', () => { if (confirm('Reset all answers and start again?')) { state.values = {}; state.checked = {}; localStorage.removeItem('biol108-attempt'); render(); updateProgress(); updateScore(); } });
  window.setInterval(tick, 1000); tick();
}

function render() {
  $('#station-nav').innerHTML = state.exam.stations.map((s, i) => `<button class="nav-item" data-go="station-${s.id}"><span class="nav-number">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(s.title)}</span></button>`).join('');
  $('#stations').innerHTML = state.exam.stations.map(station => `<section class="station" id="station-${station.id}">
    <div class="station-head"><div class="station-kicker">STATION ${String(station.id).padStart(2, '0')}</div><div class="station-total">${station.totalMarks} MARKS</div></div>
    <h2>${escapeHtml(station.title)}</h2>${station.instructions ? `<p class="instruction">${escapeHtml(station.instructions)}</p>` : ''}
    ${renderImages(station)}${station.questions.map(q => renderQuestion(q)).join('')}
    <div class="station-end"><button class="station-check" data-station-check="${station.id}">CHECK STATION ↗</button></div>
  </section>`).join('');
  $('#stations').insertAdjacentHTML('beforeend', '<div id="overall-feedback" class="overall-feedback"></div>');
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => document.getElementById(b.dataset.go).scrollIntoView({ behavior: 'smooth' })));
  document.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', () => checkQuestion(+b.dataset.check)));
  document.querySelectorAll('[data-station-check]').forEach(b => b.addEventListener('click', () => { state.exam.stations.find(s => s.id === +b.dataset.stationCheck).questions.forEach(q => checkQuestion(q.id)); updateScore(); }));
  restoreValues();
}

function renderImages(station) {
  if (!station.images?.length) return '';
  return `<div class="station-images">${station.images.map(image => {
    const visual = image.type === 'svg' ? image.svg : `<img src="${escapeAttr(image.src)}" alt="${escapeAttr(image.alt || '')}">`;
    return `<figure class="image-card">${visual}<figcaption class="image-caption">${escapeHtml(image.caption || '')}</figcaption></figure>`;
  }).join('')}</div>`;
}

function renderQuestion(q) {
  const id = q.id;
  let input = '';
  if (q.type === 'numeric') input = `<input data-answer="${id}" type="number" step="any" inputmode="decimal" aria-label="Answer to question ${id}" placeholder="Enter a number"><span class="unit">${escapeHtml(q.unit || '')}</span>`;
  else if (q.type === 'boolean') input = `<label class="radio-option"><input type="radio" name="q-${id}" data-answer="${id}" value="true"> Yes</label><label class="radio-option"><input type="radio" name="q-${id}" data-answer="${id}" value="false"> No</label>`;
  else if (q.type === 'ordering') input = `<div class="field"><label>First</label><select class="order-select" data-answer="${id}" data-part="0"><option value="">Choose</option>${optionList(q)}</select></div><div class="field"><label>Second</label><select class="order-select" data-answer="${id}" data-part="1"><option value="">Choose</option>${optionList(q)}</select></div><div class="field"><label>Third</label><select class="order-select" data-answer="${id}" data-part="2"><option value="">Choose</option>${optionList(q)}</select></div>`;
  else if (q.type === 'multipart') input = q.answerFields.map(field => `<div class="field"><label>${escapeHtml(field.label)}</label>${field.type === 'boolean' ? `<select data-answer="${id}" data-field="${field.id}"><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></select>` : `<input type="number" step="any" data-answer="${id}" data-field="${field.id}" placeholder="Answer"><span class="unit">${escapeHtml(field.unit || '')}</span>`}</div>`).join('');
  else input = `<textarea data-answer="${id}" class="${q.type === 'long_answer' ? 'long-input' : ''}" aria-label="Answer to question ${id}" placeholder="Type your answer…"></textarea>`;
  const savedFeedback = state.checked[id] ? `<div class="feedback visible ${state.checked[id].correct ? '' : 'wrong'}"><strong>${state.checked[id].correct ? 'Correct.' : 'Not quite.'}</strong>${escapeHtml(state.checked[id].message)}</div>` : `<div class="feedback" id="feedback-${id}"></div>`;
  return `<article class="question" id="question-${id}"><div class="q-head"><span class="question-number">Q${String(id).padStart(2, '0')}</span><div class="q-text">${escapeHtml(q.question)}</div><span class="marks">${q.marks} ${q.marks === 1 ? 'MARK' : 'MARKS'}</span></div><div class="answer-area">${input}</div><button class="check-btn" data-check="${id}">CHECK ANSWER</button>${savedFeedback}</article>`;
}
function optionList(q) { return q.options.map(o => `<option value="${escapeAttr(o.id)}">${escapeHtml(o.id)} — ${escapeHtml(o.text)}</option>`).join(''); }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function onInput(e) { const el = e.target.closest('[data-answer]'); if (!el) return; const id = el.dataset.answer; if (el.dataset.part !== undefined) { const arr = state.values[id] || ['', '', '']; arr[+el.dataset.part] = el.value; state.values[id] = arr; } else if (el.dataset.field) { state.values[id] ||= {}; state.values[id][el.dataset.field] = el.value; } else if (el.type === 'radio') { if (el.checked) state.values[id] = el.value; } else state.values[id] = el.value; persist(); updateProgress(); }
function restoreValues() { document.querySelectorAll('[data-answer]').forEach(el => { const value = state.values[el.dataset.answer]; if (el.dataset.part !== undefined) el.value = value?.[+el.dataset.part] || ''; else if (el.dataset.field) el.value = value?.[el.dataset.field] ?? ''; else if (el.type === 'radio') el.checked = String(value) === el.value; else el.value = value ?? ''; }); }
function persist() { localStorage.setItem('biol108-attempt', JSON.stringify({ values: state.values, checked: state.checked })); }
function answered(id) { const q = findQuestion(id), val = state.values[id]; if (q.type === 'ordering') return Array.isArray(val) && val.every(Boolean); if (q.type === 'multipart') return q.answerFields.every(f => val?.[f.id] !== undefined && val[f.id] !== ''); return val !== undefined && String(val).trim() !== ''; }
function findQuestion(id) { for (const s of state.exam.stations) { const q = s.questions.find(q => q.id === id); if (q) return q; } }
function checkQuestion(id) { const q = findQuestion(id), key = state.key.get(id); if (!answered(id)) { const el = $(`#feedback-${id}`); el.className = 'feedback visible wrong'; el.innerHTML = '<strong>Add an answer first.</strong> Enter a response before checking this question.'; return; } const correct = grade(q, state.values[id], key); const message = correct ? `Answer key: ${key.correctAnswer}` : `Answer key: ${key.correctAnswer}${q.explanation ? ` · ${q.explanation}` : ''}`; state.checked[id] = { correct, message }; const article = $(`#question-${id}`); const feedback = article.querySelector('.feedback'); feedback.className = `feedback visible ${correct ? '' : 'wrong'}`; feedback.innerHTML = `<strong>${correct ? 'Correct.' : 'Not quite.'}</strong>${escapeHtml(message)}`; persist(); updateScore(); }
function grade(q, value, key) {
  const expected = key.correctAnswer;
  if (q.type === 'boolean') return String(value) === (/^(yes|true)$/i.test(String(expected).trim()) ? 'true' : 'false');
  if (q.type === 'numeric') { const actual = parseFloat(value); const target = parseFloat(String(expected).replace(',', '.')); return Number.isFinite(actual) && Number.isFinite(target) && Math.abs(actual - target) <= Math.max(.01, Math.abs(target) * .005); }
  if (q.type === 'ordering') { const target = Array.isArray(expected) ? expected : String(expected).split(/[,\s]+/); return value.map(norm).join('|') === target.map(norm).join('|'); }
  if (q.type === 'multipart') { const nums = String(expected).match(/\d+(?:\.\d+)?/g) || []; const fields = q.answerFields; return nums.length >= 2 && fields.length === 3 && Math.abs(+value[fields[0].id] - +nums[0]) < .01 && Math.abs(+value[fields[1].id] - +nums[1]) < .01 && String(value[fields[2].id]) === (/\byes\b/i.test(expected) ? 'true' : 'false'); }
  const actual = norm(value), target = norm(expected);
  if (q.type === 'long_answer') {
    if (q.id === 22) return actual.includes('no') && actual.includes('apparent size') && actual.includes('changes');
    if (q.id === 30) return actual.includes('no') && actual.includes('drawing magnification') && actual.includes('microscope magnification') && (actual.includes('independent') || actual.includes('do not have to be equal') || actual.includes('not equal'));
    return actual === target;
  }
  if (actual === target || actual.includes(target)) return true;
  if (q.acceptedAnswers?.some(a => actual === norm(a))) return true;
  if (q.acceptedKeywords?.length) return q.acceptedKeywords.every(k => actual.includes(norm(k)));
  return false;
}
function updateProgress() { let count = 0, total = 0; for (const s of state.exam.stations) for (const q of s.questions) { total++; if (answered(q.id)) count++; } $('#progress-label').textContent = `${count} / ${total} answered`; $('#progress-bar').style.width = `${count / total * 100}%`; document.querySelectorAll('.nav-item').forEach((b, i) => { const station = state.exam.stations[i]; b.classList.toggle('active', location.hash === `#station-${station.id}`); b.classList.toggle('done', station.questions.every(q => answered(q.id))); }); }
function updateScore() { let earned = 0, checked = 0; for (const s of state.exam.stations) for (const q of s.questions) { if (state.checked[q.id]) { checked++; if (state.checked[q.id].correct) earned += q.marks; } } $('#score').innerHTML = `${earned}<small> / ${state.exam.totalMarks}</small>`; $('#score-detail').textContent = checked ? `${earned} marks · ${checked} checked` : 'Not checked yet'; }
function tick() { const elapsed = Math.floor((Date.now() - state.clockStarted) / 1000), left = Math.max(0, state.duration - elapsed); $('#timer').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; }
window.addEventListener('hashchange', updateProgress);
init().catch(err => { console.error(err); document.querySelector('.content').innerHTML = '<p>Could not load the exam data. Open this page from a local web server so the JSON files can be fetched.</p>'; });
