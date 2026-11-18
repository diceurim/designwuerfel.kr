const shopButton = document.getElementById('shopButton');
const root = document.documentElement;
const arrow = document.createElement('img');
arrow.className = 'shop-entry-arrow';
arrow.src = 'assets/cursors/handdrawn-arrow.svg';
arrow.alt = '';

let pressed = false;

function positionArrow(event) {
  arrow.style.left = event.clientX + 'px';
  arrow.style.top = event.clientY + 'px';
}

function clearArrow() {
  pressed = false;
  arrow.remove();
  root.classList.remove('shop-entry-cursor');
}

shopButton.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0) return;
  positionArrow(event);
  document.body.append(arrow);
  pressed = true;
  root.classList.add('shop-entry-cursor');
});

window.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || !arrow.isConnected) return;
  if (pressed && event.buttons & 1) positionArrow(event);
  else clearArrow();
});
window.addEventListener('pointerup', () => { pressed = false; });
window.addEventListener('pointercancel', clearArrow);
window.addEventListener('blur', clearArrow);
root.addEventListener('pointerleave', clearArrow);
