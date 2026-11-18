import qrcode from '/vendor/qrcode.mjs';

const storageKey = 'qr-base-url';
const base = document.querySelector('#base');
const binderSelect = document.querySelector('#binder');
const grid = document.querySelector('#grid');
let binders = [];

base.value = localStorage.getItem(storageKey) || location.origin;

function cleanBase() {
  try {
    const url = new URL(base.value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function svgFor(text) {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  return code.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function render() {
  const root = cleanBase();
  const local = !root || /^https?:\/\/(localhost|127\.|\[::1\])/.test(root);
  document.querySelector('#warning').hidden = !local;
  grid.replaceChildren();
  if (!root) {
    document.querySelector('#count').textContent = 'Bitte eine gültige Adresse eingeben.';
    return;
  }
  const selected = binderSelect.value;
  const entries = binders
    .filter((binder) => selected === 'all' || String(binder.id) === selected)
    .flatMap((binder) => binder.entries.filter((entry) => entry.kind === 'home'));
  for (const entry of entries) {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = svgFor(`${root}/?pokemon=${entry.dex}`);
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const number = document.createElement('span');
    number.textContent = `#${String(entry.dex).padStart(3, '0')}`;
    tag.append(name, number);
    grid.append(tag);
  }
  document.querySelector('#count').textContent = `${entries.length} QR-Codes`;
}

base.addEventListener('input', () => {
  if (cleanBase()) localStorage.setItem(storageKey, base.value.trim());
  render();
});
binderSelect.addEventListener('change', render);
document.querySelector('#print').addEventListener('click', () => window.print());

const response = await fetch('/api/binders');
({ binders } = await response.json());
for (const binder of binders) {
  const option = document.createElement('option');
  option.value = String(binder.id);
  option.textContent = `${binder.name}-Binder`;
  binderSelect.append(option);
}
render();
