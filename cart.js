// 장바구니(Shop 화면, 데스크톱·휴대폰)
// - 구매 패널(휴대폰은 상세 화면)의 '카트에 추가'를 누르면 Lampe가 하나 담기고, 위쪽 띠의 장바구니 아이콘 아래로 장바구니 카드가 열립니다.
// - 아이콘을 누르면 카드를 열고 닫습니다. ×, Esc, 카드 바깥을 눌러도 닫힙니다.
// - 수량은 −/+로 바꾸고, 0이 되면 장바구니에서 빠집니다. 담은 개수는 이 브라우저에만 기억합니다.
(() => {
  const PRICE_KRW = 320000, PRICE_EUR = 210, KEY = 'wuerfel-cart';
  const button = document.getElementById('cartButton');
  const popover = document.getElementById('cartPopover');
  if (!button || !popover) return;
  const count = button.querySelector('.cart-count');
  const empty = popover.querySelector('.cart-empty'), item = popover.querySelector('.cart-item');
  const qtyValue = popover.querySelector('.cart-qty-value');
  const krw = popover.querySelector('.cart-price-krw'), eur = popover.querySelector('.cart-price-eur');
  const checkout = popover.querySelector('.cart-checkout'), note = popover.querySelector('.cart-note');

  let qty = 0;
  try { qty = Math.max(0, parseInt(localStorage.getItem(KEY), 10) || 0); } catch (error) { qty = 0; }

  function render() {
    count.hidden = qty === 0;
    count.textContent = qty;
    empty.hidden = qty > 0;
    item.hidden = checkout.hidden = qty === 0;
    if (qty === 0) note.hidden = true;
    qtyValue.textContent = qty;
    krw.textContent = '₩' + (PRICE_KRW * qty).toLocaleString('ko-KR');
    eur.textContent = (PRICE_EUR * qty).toLocaleString('de-DE') + ' €';
    button.setAttribute('aria-label', qty ? `장바구니, ${qty}개 담김` : '장바구니');
  }
  function save() { try { localStorage.setItem(KEY, String(qty)); } catch (error) { /* 저장이 막혀 있으면 이번 방문에서만 기억합니다. */ } }
  function setQty(next) { qty = Math.max(0, next); save(); render(); }
  function open() { popover.hidden = false; button.setAttribute('aria-expanded', 'true'); }
  function close() { popover.hidden = true; button.setAttribute('aria-expanded', 'false'); note.hidden = true; }

  button.addEventListener('click', event => { event.stopPropagation(); popover.hidden ? open() : close(); });
  popover.querySelector('.cart-close').addEventListener('click', close);
  popover.querySelector('.cart-minus').addEventListener('click', () => setQty(qty - 1));
  popover.querySelector('.cart-plus').addEventListener('click', () => setQty(qty + 1));
  checkout.addEventListener('click', () => { note.hidden = false; });
  // 구매 패널(데스크톱)의 수량 칸: 1개부터 고르고, '카트에 추가'를 누르면 그만큼 담은 뒤 다시 1로 돌아갑니다.
  let pick = 1;
  const pickValue = document.querySelector('#shopPanel .shop-panel-qty-value');
  const showPick = () => { if (pickValue) pickValue.textContent = pick; };
  document.querySelector('#shopPanel .shop-panel-qty-minus')?.addEventListener('click', () => { pick = Math.max(1, pick - 1); showPick(); });
  document.querySelector('#shopPanel .shop-panel-qty-plus')?.addEventListener('click', () => { pick += 1; showPick(); });
  // '카트에 추가': 데스크톱 구매 패널과, 휴대폰 상세 화면에 복제된 버튼 모두 받습니다(복제본에는 이벤트가 따라가지 않아 문서에서 받음).
  // 데스크톱은 수량 칸에서 고른 개수만큼, 휴대폰은 하나씩 담고 장바구니 카드에서 수량을 바꿉니다.
  document.addEventListener('click', event => {
    const add = event.target.closest('.shop-panel-buy:not(.shop-panel-buy-now)');
    if (!add) return;
    const fromPanel = !!add.closest('#shopPanel');
    setQty(qty + (fromPanel ? pick : 1));
    if (fromPanel) { pick = 1; showPick(); }
    open();
    // 숫자가 바뀐 것이 보이도록 아이콘을 살짝 튕깁니다.
    button.classList.remove('cart-bump'); void button.offsetWidth; button.classList.add('cart-bump');
  });
  document.addEventListener('pointerdown', event => {
    if (!popover.hidden && !popover.contains(event.target) && !button.contains(event.target) && !event.target.closest('.shop-panel-buy, .shop-panel-qty')) close();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !popover.hidden) close(); });
  // Shop을 떠나면 카드도 닫습니다.
  new MutationObserver(() => { if (!document.body.classList.contains('is-shop')) close(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  // 구매 패널(데스크톱)의 두 버튼 폭을 제품 설명 글 폭에 맞춥니다(원래 232×56을 같은 비율로 줄임).
  const panel = document.getElementById('shopPanel'), info = panel && panel.querySelector('.shop-panel-info');
  if (info && window.ResizeObserver) new ResizeObserver(() => {
    const w = info.getBoundingClientRect().width;
    if (w > 0) panel.style.setProperty('--shop-buy-scale', Math.min(1, w / 232).toFixed(4));
  }).observe(info);
  render();
})();
