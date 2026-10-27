// 종이를 작은 면으로 나누어 각 부분이 서로 다른 각도로 휘어지게 합니다.
// 오른쪽 아래부터 곡률이 생기고, 말린 경계가 위로 이동합니다.
function paperCurlPoint(x, y, width, height, progress) {
  const radius = height * .19;
  const cornerLead = height * .26 * Math.sin(Math.PI * progress) * (1 - x / width);
  const fold = height * (1 - progress * 1.85) + cornerLead;
  const distance = Math.max(0, y - fold);
  const angle = Math.min(Math.PI, distance / radius);
  const tail = Math.max(0, distance - Math.PI * radius);
  return [x, distance ? fold + radius * Math.sin(angle) - tail : y,
    radius * (1 - Math.cos(angle))];
}

function animateFlexiblePaper(copy, reduced) {
  if (reduced) return copy.animate([{opacity: 1}, {opacity: 0}], {duration: 0});
  const {width, height} = copy.getBoundingClientRect();
  const padding = getComputedStyle(copy).padding;
  const mesh = document.createElement('div');
  mesh.className = 'paper-curl'; mesh.setAttribute('aria-hidden', 'true');
  copy.parentElement.append(mesh);
  const columns = 8, rows = 24;
  const tileWidth = width / columns, tileHeight = height / rows;
  const tiles = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const tile = document.createElement('div'); tile.className = 'paper-curl-tile';
    const front = document.createElement('div'); front.className = 'paper-curl-front';
    const content = copy.cloneNode(true);
    content.className = 'writing-paper paper-copy paper-curl-content';
    Object.assign(content.style, {width: `${width}px`, height: `${height}px`, padding,
      left: `${-column * tileWidth}px`, top: `${-row * tileHeight}px`});
    const shade = document.createElement('div'); shade.className = 'paper-curl-shade';
    front.append(content, shade);
    const back = document.createElement('div'); back.className = 'paper-curl-back';
    tile.append(front, back);
    Object.assign(tile.style, {width: `${tileWidth + .5}px`, height: `${tileHeight + .5}px`});
    mesh.append(tile); tiles.push({tile, shade, back, x: column * tileWidth, y: row * tileHeight});
  }
  copy.style.visibility = 'hidden';
  let frameId, done = false, resolveFinished;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  const finish = () => {
    if (done) return;
    done = true; cancelAnimationFrame(frameId); mesh.remove(); resolveFinished();
  };
  const start = performance.now();
  const duration = 1450;
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    // 천천히 모서리를 들어 올리고, 중간에 넘긴 뒤 부드럽게 마무리합니다.
    const p = t * t * (3 - 2 * t);
    mesh.style.opacity = String(t < .88 ? 1 : (1 - t) / .12);
    for (const {tile, shade, back, x, y} of tiles) {
      const a = paperCurlPoint(x, y, width, height, p);
      const b = paperCurlPoint(x + tileWidth, y, width, height, p);
      const c = paperCurlPoint(x, y + tileHeight, width, height, p);
      const u = b.map((n, i) => (n - a[i]) / tileWidth);
      const v = c.map((n, i) => (n - a[i]) / tileHeight);
      const normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      tile.style.transform = `matrix3d(${u.join(',')},0,${v.join(',')},0,${normal.join(',')},0,${a.join(',')},1)`;
      const darkness = .16 * (1 - Math.abs(v[1]));
      shade.style.opacity = String(darkness);
      const grey = Math.round(250 - 30 * (1 - Math.abs(v[1])));
      back.style.backgroundColor = `rgb(${grey},${grey},${grey})`;
    }
    if (t < 1) frameId = requestAnimationFrame(frame); else finish();
  }
  frameId = requestAnimationFrame(frame);
  return {finished, cancel: finish};
}
