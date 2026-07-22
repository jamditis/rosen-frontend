const stamp = document.querySelector('.portrait-stamp');
const secret = document.querySelector('#archive-secret');
const closeButton = secret?.querySelector('.secret-close');

let stampPresses = 0;
let stampReset;
let typed = '';

function revealSecret() {
  if (!secret || !secret.hidden) return;
  secret.hidden = false;
  requestAnimationFrame(() => secret.classList.add('is-visible'));
  secret.focus();
}

function hideSecret() {
  if (!secret || secret.hidden) return;
  secret.classList.remove('is-visible');
  window.setTimeout(() => {
    secret.hidden = true;
    stamp?.focus();
  }, 180);
}

stamp?.addEventListener('click', () => {
  stampPresses += 1;
  window.clearTimeout(stampReset);
  stampReset = window.setTimeout(() => { stampPresses = 0; }, 1400);
  if (stampPresses >= 3) {
    stampPresses = 0;
    revealSecret();
  }
});

closeButton?.addEventListener('click', hideSecret);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideSecret();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
  typed = `${typed}${event.key.toLowerCase()}`.slice(-8);
  if (typed.endsWith('audience')) revealSecret();
});
