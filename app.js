const SVG_NS = 'http://www.w3.org/2000/svg';
const palette = ['#70bf31', '#dc4f35', '#49bdd0', '#8a67d5', '#e49a2f', '#df6697', '#202522', '#f06483'];

const exampleRoutes = [
  { id: 1, name: '卧室动线', color: '#70bf31', duration: 2.35, delay: 0.15, points: [{x:511,y:600},{x:511,y:772},{x:433,y:855},{x:345,y:965},{x:345,y:1033},{x:234,y:1127}], d: 'M 511 600 L 511 772 C 511 828 478 842 433 855 C 378 871 345 907 345 965 L 345 1033 C 345 1087 303 1127 234 1127' },
  { id: 2, name: '客厅动线', color: '#dc4f35', duration: 2.55, delay: 0.42, points: [{x:531,y:600},{x:531,y:785},{x:598,y:884},{x:644,y:969},{x:644,y:1154},{x:597,y:1242}], d: 'M 531 600 L 531 785 C 531 838 557 858 598 884 C 629 904 644 930 644 969 L 644 1154 C 644 1190 628 1217 597 1242' },
  { id: 3, name: '厨房动线', color: '#49bdd0', duration: 2.1, delay: 0.72, points: [{x:546,y:600},{x:630,y:691},{x:731,y:793},{x:780,y:875},{x:864,y:896}], d: 'M 546 600 C 548 649 578 681 630 691 C 693 703 726 739 731 793 C 737 856 778 894 836 896 L 864 896' }
];

const state = {
  width: 1080,
  height: 1920,
  background: 'assets/background.png',
  routes: structuredClone(exampleRoutes),
  lineWidth: 10,
  speed: 1,
  loop: true,
  drawing: false,
  draftPoints: [],
  draftColor: '#8a67d5',
  selectedRouteId: 1,
  editingAnchors: false,
  addingAnchor: false,
  selectedAnchorIndex: null,
  draggingAnchorIndex: null,
  nextId: 4,
  loopTimer: null,
  motionTimers: [],
  toastTimer: null
};

const els = {
  plan: document.querySelector('#plan'),
  svg: document.querySelector('#editorCanvas'),
  background: document.querySelector('#backgroundImage'),
  routeLayer: document.querySelector('#routeLayer'),
  draftLayer: document.querySelector('#draftLayer'),
  routeList: document.querySelector('#routeList'),
  paletteButtons: document.querySelector('#paletteButtons'),
  routeCount: document.querySelector('#routeCount'),
  canvasSize: document.querySelector('#canvasSize'),
  canvasStatus: document.querySelector('#canvasStatus'),
  canvasHint: document.querySelector('#canvasHint'),
  backgroundInput: document.querySelector('#backgroundInput'),
  startDraw: document.querySelector('#startDrawButton'),
  undoPoint: document.querySelector('#undoPointButton'),
  finishDraw: document.querySelector('#finishDrawButton'),
  cancelDraw: document.querySelector('#cancelDrawButton'),
  drawTip: document.querySelector('#drawTip'),
  editAnchors: document.querySelector('#editAnchorsButton'),
  addAnchor: document.querySelector('#addAnchorButton'),
  deleteAnchor: document.querySelector('#deleteAnchorButton'),
  finishAnchors: document.querySelector('#finishAnchorsButton'),
  anchorTip: document.querySelector('#anchorTip'),
  lineWidth: document.querySelector('#lineWidthInput'),
  lineWidthValue: document.querySelector('#lineWidthValue'),
  speed: document.querySelector('#speedInput'),
  speedValue: document.querySelector('#speedValue'),
  loop: document.querySelector('#loopInput'),
  preview: document.querySelector('#previewButton'),
  exportMp4: document.querySelector('#exportMp4Button'),
  exportHtml: document.querySelector('#exportHtmlButton'),
  exportPng: document.querySelector('#exportPngButton'),
  reset: document.querySelector('#resetExampleButton'),
  toast: document.querySelector('#toast')
};

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  state.toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
}

function selectedRoute() {
  return state.routes.find(route => route.id === state.selectedRouteId) || null;
}

function routeTiming(route) {
  return { duration: route.duration / state.speed, delay: route.delay / state.speed };
}

function renderRoutes({ restart = true } = {}) {
  els.routeLayer.replaceChildren();
  state.routes.forEach(route => {
    const timing = routeTiming(route);
    const path = svgEl('path', {
      class: 'route-path', 'data-route-id': route.id, d: route.d, pathLength: '1',
      stroke: route.color, 'stroke-width': state.lineWidth,
      style: `--duration:${timing.duration}s;--delay:${timing.delay}s`
    });
    const circle = svgEl('circle', {
      class: 'tracer', 'data-route-id': route.id, r: Math.max(4, state.lineWidth * .6),
      fill: route.color, style: `--duration:${timing.duration}s;--delay:${timing.delay}s`
    });
    circle.append(svgEl('animateMotion', {
      class: 'tracer-motion', dur: `${timing.duration}s`, begin: 'indefinite',
      fill: 'freeze', path: route.d
    }));
    els.routeLayer.append(path, circle);
  });
  renderRouteList();
  renderPalette();
  updateAnchorControls();
  els.routeCount.textContent = `${state.routes.length} 条动线`;
  if (state.editingAnchors) renderAnchorEditor();
  if (restart && !state.drawing && !state.editingAnchors) startAnimation();
}

function renderRouteList() {
  if (!state.routes.length) {
    els.routeList.innerHTML = '<div class="empty-routes">还没有动线，请点击“新建动线”</div>';
    return;
  }
  els.routeList.innerHTML = state.routes.map(route => `
    <div class="route-item${route.id === state.selectedRouteId ? ' is-selected' : ''}" data-route-id="${route.id}">
      <input class="route-color" type="color" value="${route.color}" aria-label="${escapeHtml(route.name)}颜色" />
      <input class="route-name" type="text" value="${escapeHtml(route.name)}" aria-label="动线名称" />
      <button class="delete-route" type="button" aria-label="删除${escapeHtml(route.name)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>
      </button>
    </div>`).join('');
}

function renderPalette() {
  const activeColor = state.drawing ? state.draftColor : selectedRoute()?.color;
  els.paletteButtons.innerHTML = palette.map(color => `
    <button class="palette-button" type="button" data-color="${color}" style="--swatch:${color}" aria-label="选择颜色 ${color}" aria-pressed="${color.toLowerCase() === activeColor?.toLowerCase()}"></button>
  `).join('');
}

function selectRoute(id) {
  state.selectedRouteId = id;
  state.selectedAnchorIndex = null;
  document.querySelectorAll('.route-item').forEach(item => item.classList.toggle('is-selected', Number(item.dataset.routeId) === id));
  renderPalette();
  updateAnchorControls();
  if (state.editingAnchors) renderAnchorEditor();
}

function clearAnimationTimers() {
  window.clearTimeout(state.loopTimer);
  state.motionTimers.forEach(window.clearTimeout);
  state.motionTimers = [];
}

function startAnimation() {
  if (state.drawing || state.editingAnchors) return;
  clearAnimationTimers();
  els.plan.classList.remove('is-playing');
  void els.plan.offsetWidth;
  els.plan.classList.add('is-playing');
  const motions = [...els.routeLayer.querySelectorAll('.tracer-motion')];
  motions.forEach((motion, index) => {
    const timing = routeTiming(state.routes[index]);
    state.motionTimers.push(window.setTimeout(() => motion.beginElement(), timing.delay * 1000));
  });
  if (state.loop && state.routes.length) {
    const finish = Math.max(...state.routes.map(route => {
      const timing = routeTiming(route);
      return timing.delay + timing.duration;
    }));
    state.loopTimer = window.setTimeout(startAnimation, (finish + 1.25) * 1000);
  }
}

function setDrawing(active) {
  state.drawing = active;
  if (active) {
    state.draftPoints = [];
    state.draftColor = palette[state.routes.length % palette.length];
    state.editingAnchors = false;
    clearAnimationTimers();
    els.plan.classList.remove('is-playing', 'is-editing');
  } else {
    state.draftPoints = [];
    els.draftLayer.replaceChildren();
  }
  els.plan.classList.toggle('is-drawing', active);
  els.startDraw.classList.toggle('is-hidden', active);
  els.undoPoint.classList.toggle('is-hidden', !active);
  els.finishDraw.classList.toggle('is-hidden', !active);
  els.cancelDraw.classList.toggle('is-hidden', !active);
  els.drawTip.classList.toggle('is-hidden', !active);
  els.canvasHint.classList.toggle('is-hidden', !active);
  els.canvasHint.textContent = '点击户型图添加路径点';
  els.canvasStatus.textContent = active ? '绘制动线' : '动画预览';
  els.finishDraw.disabled = state.draftPoints.length < 2;
  renderPalette();
  updateAnchorControls();
  if (!active) startAnimation();
}

function pointsToPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)} ${cp2.x.toFixed(1)} ${cp2.y.toFixed(1)} ${p2.x} ${p2.y}`;
  }
  return d;
}

function renderDraft() {
  els.draftLayer.replaceChildren();
  if (state.draftPoints.length > 1) {
    els.draftLayer.append(svgEl('path', { class: 'draft-path', d: pointsToPath(state.draftPoints), stroke: state.draftColor, 'stroke-width': state.lineWidth }));
  }
  state.draftPoints.forEach(point => {
    els.draftLayer.append(svgEl('circle', { class: 'draft-point', cx: point.x, cy: point.y, r: Math.max(7, state.lineWidth * .8), stroke: state.draftColor }));
  });
  els.finishDraw.disabled = state.draftPoints.length < 2;
}

function eventToSvgPoint(event) {
  const point = els.svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const result = point.matrixTransform(els.svg.getScreenCTM().inverse());
  return { x: Math.round(Math.max(0, Math.min(state.width, result.x))), y: Math.round(Math.max(0, Math.min(state.height, result.y))) };
}

function finishDrawing() {
  if (state.draftPoints.length < 2) return;
  const points = structuredClone(state.draftPoints);
  const d = pointsToPath(points);
  const measure = svgEl('path', { d });
  els.svg.append(measure);
  const length = measure.getTotalLength();
  measure.remove();
  const route = {
    id: state.nextId++, name: `动线 ${state.routes.length + 1}`, color: state.draftColor,
    duration: Math.max(1.2, Math.min(4.5, length / 280)), delay: state.routes.length * .27, points, d
  };
  state.routes.push(route);
  state.selectedRouteId = route.id;
  setDrawing(false);
  renderRoutes();
  showToast('新动线已生成');
}

function updateAnchorControls() {
  const hasRoute = Boolean(selectedRoute());
  els.editAnchors.disabled = !hasRoute || state.drawing;
  els.editAnchors.classList.toggle('is-hidden', state.editingAnchors);
  els.addAnchor.classList.toggle('is-hidden', !state.editingAnchors);
  els.deleteAnchor.classList.toggle('is-hidden', !state.editingAnchors);
  els.finishAnchors.classList.toggle('is-hidden', !state.editingAnchors);
  els.anchorTip.classList.toggle('is-hidden', !state.editingAnchors);
  els.deleteAnchor.disabled = state.selectedAnchorIndex === null || (selectedRoute()?.points.length || 0) <= 2;
  els.addAnchor.textContent = state.addingAnchor ? '取消添加' : '添加锚点';
  els.startDraw.disabled = state.editingAnchors;
}

function setAnchorEditing(active) {
  if (active && !selectedRoute()) return;
  state.editingAnchors = active;
  state.addingAnchor = false;
  state.selectedAnchorIndex = null;
  state.draggingAnchorIndex = null;
  els.plan.classList.toggle('is-editing', active);
  els.plan.classList.remove('is-playing');
  els.canvasStatus.textContent = active ? '曲线调节' : '动画预览';
  els.canvasHint.classList.toggle('is-hidden', !active);
  els.canvasHint.textContent = '拖动锚点调节曲线';
  if (active) {
    clearAnimationTimers();
    renderAnchorEditor();
  } else {
    els.draftLayer.replaceChildren();
    startAnimation();
  }
  updateAnchorControls();
}

function renderAnchorEditor() {
  els.draftLayer.replaceChildren();
  const route = selectedRoute();
  if (!route?.points?.length) return;
  els.draftLayer.append(svgEl('path', { class: 'anchor-guide', d: pointsToPath(route.points) }));
  route.points.forEach((point, index) => {
    els.draftLayer.append(svgEl('circle', {
      class: `anchor-point${index === state.selectedAnchorIndex ? ' is-selected' : ''}`,
      'data-anchor-index': index, cx: point.x, cy: point.y,
      r: Math.max(9, state.lineWidth * .9), stroke: route.color
    }));
  });
}

function updateSelectedRouteGeometry() {
  const route = selectedRoute();
  if (!route) return;
  route.d = pointsToPath(route.points);
  const path = els.routeLayer.querySelector(`.route-path[data-route-id="${route.id}"]`);
  const motion = els.routeLayer.querySelector(`.tracer[data-route-id="${route.id}"] animateMotion`);
  path?.setAttribute('d', route.d);
  motion?.setAttribute('path', route.d);
  renderAnchorEditor();
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function insertAnchor(point) {
  const route = selectedRoute();
  if (!route || route.points.length < 2) return;
  let insertAt = 1;
  let bestDistance = Infinity;
  for (let index = 0; index < route.points.length - 1; index++) {
    const distance = distanceToSegment(point, route.points[index], route.points[index + 1]);
    if (distance < bestDistance) { bestDistance = distance; insertAt = index + 1; }
  }
  route.points.splice(insertAt, 0, point);
  state.selectedAnchorIndex = insertAt;
  state.addingAnchor = false;
  updateSelectedRouteGeometry();
  updateAnchorControls();
  showToast('锚点已添加');
}

function deleteSelectedAnchor() {
  const route = selectedRoute();
  if (!route || state.selectedAnchorIndex === null || route.points.length <= 2) return;
  route.points.splice(state.selectedAnchorIndex, 1);
  state.selectedAnchorIndex = null;
  updateSelectedRouteGeometry();
  updateAnchorControls();
  showToast('锚点已删除');
}

function loadBackground(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      state.background = reader.result;
      state.width = image.naturalWidth;
      state.height = image.naturalHeight;
      state.routes = [];
      state.selectedRouteId = null;
      state.nextId = 1;
      els.svg.setAttribute('viewBox', `0 0 ${state.width} ${state.height}`);
      els.background.setAttribute('href', state.background);
      els.background.setAttribute('width', state.width);
      els.background.setAttribute('height', state.height);
      els.plan.style.aspectRatio = `${state.width} / ${state.height}`;
      els.canvasSize.textContent = `${state.width} × ${state.height}`;
      setAnchorEditing(false);
      setDrawing(false);
      renderRoutes();
      showToast('底图已替换，请开始绘制动线');
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function backgroundDataUrl() {
  if (state.background.startsWith('data:')) return state.background;
  const image = await loadImage(state.background);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngResolutionChunk(dpi) {
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9, false);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, pixelsPerMeter, false);
  view.setUint32(12, pixelsPerMeter, false);
  chunk[16] = 1;
  view.setUint32(17, pngCrc32(chunk.subarray(4, 17)), false);
  return chunk;
}

async function setPngDpi(blob, dpi) {
  const source = new Uint8Array(await blob.arrayBuffer());
  const sourceView = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const resolutionChunk = createPngResolutionChunk(dpi);
  let offset = 8;
  let insertAt = null;

  while (offset + 12 <= source.length) {
    const length = sourceView.getUint32(offset, false);
    const type = String.fromCharCode(...source.subarray(offset + 4, offset + 8));
    if (type === 'IHDR') insertAt = offset + 12 + length;
    if (type === 'pHYs' && length === 9) {
      const output = source.slice();
      output.set(resolutionChunk, offset);
      return new Blob([output], { type: 'image/png' });
    }
    offset += 12 + length;
  }

  if (insertAt === null) return blob;
  const output = new Uint8Array(source.length + resolutionChunk.length);
  output.set(source.subarray(0, insertAt), 0);
  output.set(resolutionChunk, insertAt);
  output.set(source.subarray(insertAt), insertAt + resolutionChunk.length);
  return new Blob([output], { type: 'image/png' });
}

async function exportPng() {
  try {
    const image = await loadImage(state.background);
    const canvas = document.createElement('canvas');
    canvas.width = state.width;
    canvas.height = state.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, state.width, state.height);
    context.lineWidth = state.lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    state.routes.forEach(route => { context.strokeStyle = route.color; context.stroke(new Path2D(route.d)); });
    canvas.toBlob(async blob => {
      try {
        if (!blob) throw new Error('PNG encoding failed');
        const png72Ppi = await setPngDpi(blob, 72);
        downloadBlob(png72Ppi, '户型动线_72ppi.png');
        showToast('72 PPI 静态图片已导出');
      } catch {
        showToast('PNG 导出失败，请重试');
      }
    }, 'image/png');
  } catch { showToast('导出失败，请先重新上传底图'); }
}

function cubicBezierProgress(x) {
  let low = 0;
  let high = 1;
  let t = x;
  for (let i = 0; i < 12; i++) {
    t = (low + high) / 2;
    const mt = 1 - t;
    const currentX = 3 * mt * mt * t * .43 + 3 * mt * t * t * .25 + t * t * t;
    if (currentX < x) low = t; else high = t;
  }
  const mt = 1 - t;
  return 3 * mt * t * t + t * t * t;
}

function drawPartialRoute(context, path, progress) {
  const length = path.getTotalLength();
  const visible = length * progress;
  const step = Math.max(2, length / 280);
  const first = path.getPointAtLength(0);
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let distance = step; distance < visible; distance += step) {
    const point = path.getPointAtLength(distance);
    context.lineTo(point.x, point.y);
  }
  const end = path.getPointAtLength(visible);
  context.lineTo(end.x, end.y);
  context.stroke();
  return end;
}

function supportedMp4Mime() {
  if (!window.MediaRecorder) return null;
  return ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || null;
}

async function exportMp4() {
  const mimeType = supportedMp4Mime();
  if (!mimeType || !HTMLCanvasElement.prototype.captureStream) {
    showToast('当前浏览器不支持 MP4 录制，请使用最新版 Chrome 或 Edge');
    return;
  }
  if (!state.routes.length) { showToast('请先绘制至少一条动线'); return; }

  const originalContent = els.exportMp4.innerHTML;
  try {
    els.exportMp4.disabled = true;
    const image = await loadImage(state.background);
    const scale = Math.min(1, 1080 / state.width, 1920 / state.height);
    const outputWidth = Math.max(2, Math.floor(state.width * scale / 2) * 2);
    const outputHeight = Math.max(2, Math.floor(state.height * scale / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    const paths = state.routes.map(route => els.routeLayer.querySelector(`.route-path[data-route-id="${route.id}"]`));
    const finish = Math.max(...state.routes.map(route => {
      const timing = routeTiming(route);
      return timing.delay + timing.duration;
    }));
    const totalDuration = finish + 1.1;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
    const stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
    recorder.start(250);
    const start = performance.now();

    await new Promise(resolve => {
      function renderFrame(now) {
        const elapsed = Math.min(totalDuration, (now - start) / 1000);
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, outputWidth, outputHeight);
        context.drawImage(image, 0, 0, outputWidth, outputHeight);
        context.save();
        context.scale(outputWidth / state.width, outputHeight / state.height);
        context.lineWidth = state.lineWidth;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        state.routes.forEach((route, index) => {
          const timing = routeTiming(route);
          const raw = Math.max(0, Math.min(1, (elapsed - timing.delay) / timing.duration));
          if (raw <= 0) return;
          context.strokeStyle = route.color;
          context.fillStyle = route.color;
          const point = drawPartialRoute(context, paths[index], cubicBezierProgress(raw));
          if (raw < .93) {
            context.beginPath();
            context.arc(point.x, point.y, Math.max(4, state.lineWidth * .6), 0, Math.PI * 2);
            context.fill();
          }
        });
        context.restore();
        els.exportMp4.textContent = `生成中 ${Math.round(elapsed / totalDuration * 100)}%`;
        if (elapsed < totalDuration) requestAnimationFrame(renderFrame);
        else resolve();
      }
      requestAnimationFrame(renderFrame);
    });

    recorder.stop();
    await stopped;
    stream.getTracks().forEach(track => track.stop());
    downloadBlob(new Blob(chunks, { type: mimeType }), '户型动线动画.mp4');
    showToast('MP4 动画已导出');
  } catch (error) {
    console.error(error);
    showToast('MP4 导出失败，请使用最新版 Chrome 或 Edge');
  } finally {
    els.exportMp4.disabled = false;
    els.exportMp4.innerHTML = originalContent;
  }
}

async function exportHtml() {
  try {
    const background = await backgroundDataUrl();
    const routes = state.routes.map(route => ({ ...route, ...routeTiming(route) }));
    const finish = routes.length ? Math.max(...routes.map(route => route.delay + route.duration)) + 1.25 : 3;
    const paths = routes.map(route => `<path class="route" pathLength="1" d="${route.d}" stroke="${route.color}" style="--duration:${route.duration}s;--delay:${route.delay}s"/><circle class="dot" r="${Math.max(4, state.lineWidth * .6)}" fill="${route.color}" style="--duration:${route.duration}s;--delay:${route.delay}s"><animateMotion dur="${route.duration}s" begin="indefinite" fill="freeze" path="${route.d}"/></circle>`).join('');
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>户型动线动画</title><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f2f1ed}body{min-height:100vh;display:grid;place-items:center;overflow:hidden}.plan{height:100vh;max-width:100vw;aspect-ratio:${state.width}/${state.height};background:#fff}.plan svg{display:block;width:100%;height:100%}.route{fill:none;stroke-width:${state.lineWidth};stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1}.play .route{animation:draw var(--duration) var(--delay) cubic-bezier(.43,0,.25,1) forwards}.dot{opacity:0}.play .dot{animation:dot var(--duration) var(--delay) ease both}@keyframes draw{to{stroke-dashoffset:0}}@keyframes dot{0%{opacity:0}5%,90%{opacity:1}100%{opacity:0}}</style><div class="plan" id="plan"><svg viewBox="0 0 ${state.width} ${state.height}"><image href="${background}" width="${state.width}" height="${state.height}"/>${paths}</svg></div><script>const plan=document.querySelector('#plan'),motions=[...document.querySelectorAll('animateMotion')],delays=${JSON.stringify(routes.map(route => route.delay * 1000))};function play(){plan.classList.remove('play');void plan.offsetWidth;plan.classList.add('play');motions.forEach((m,i)=>setTimeout(()=>m.beginElement(),delays[i]))}play();${state.loop ? `setInterval(play,${Math.round(finish * 1000)});` : ''}<\/script></html>`;
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), '户型动线动画.html');
    showToast('动画 HTML 已导出');
  } catch { showToast('导出失败，请先重新上传底图'); }
}

function resetExample() {
  Object.assign(state, {
    width:1080, height:1920, background:'assets/background.png', routes:structuredClone(exampleRoutes),
    lineWidth:10, speed:1, loop:true, drawing:false, draftPoints:[], draftColor:'#8a67d5',
    selectedRouteId:1, editingAnchors:false, addingAnchor:false, selectedAnchorIndex:null, nextId:4
  });
  els.svg.setAttribute('viewBox', '0 0 1080 1920');
  els.background.setAttribute('href', state.background);
  els.background.setAttribute('width', '1080');
  els.background.setAttribute('height', '1920');
  els.plan.style.aspectRatio = '9 / 16';
  els.plan.classList.remove('is-editing', 'is-drawing');
  els.canvasSize.textContent = '1080 × 1920';
  els.lineWidth.value = '10';
  els.lineWidthValue.textContent = '10 px';
  els.speed.value = '1';
  els.speedValue.textContent = '1.0×';
  els.loop.checked = true;
  els.draftLayer.replaceChildren();
  renderRoutes();
  showToast('示例已恢复');
}

els.backgroundInput.addEventListener('change', event => loadBackground(event.target.files[0]));
els.startDraw.addEventListener('click', () => setDrawing(true));
els.cancelDraw.addEventListener('click', () => setDrawing(false));
els.finishDraw.addEventListener('click', finishDrawing);
els.undoPoint.addEventListener('click', () => { state.draftPoints.pop(); renderDraft(); });
els.editAnchors.addEventListener('click', () => setAnchorEditing(true));
els.finishAnchors.addEventListener('click', () => setAnchorEditing(false));
els.addAnchor.addEventListener('click', () => {
  state.addingAnchor = !state.addingAnchor;
  els.canvasHint.textContent = state.addingAnchor ? '请在动线上点击添加锚点' : '拖动锚点调节曲线';
  updateAnchorControls();
});
els.deleteAnchor.addEventListener('click', deleteSelectedAnchor);

els.svg.addEventListener('click', event => {
  if (state.drawing) {
    state.draftPoints.push(eventToSvgPoint(event));
    renderDraft();
    return;
  }
  if (state.editingAnchors && state.addingAnchor && !event.target.classList.contains('anchor-point')) insertAnchor(eventToSvgPoint(event));
});

els.svg.addEventListener('pointerdown', event => {
  const anchor = event.target.closest?.('.anchor-point');
  if (!state.editingAnchors || !anchor) return;
  state.selectedAnchorIndex = Number(anchor.dataset.anchorIndex);
  state.draggingAnchorIndex = state.selectedAnchorIndex;
  els.svg.setPointerCapture(event.pointerId);
  renderAnchorEditor();
  updateAnchorControls();
});
els.svg.addEventListener('pointermove', event => {
  if (state.draggingAnchorIndex === null) return;
  const route = selectedRoute();
  route.points[state.draggingAnchorIndex] = eventToSvgPoint(event);
  updateSelectedRouteGeometry();
});
els.svg.addEventListener('pointerup', event => {
  if (state.draggingAnchorIndex === null) return;
  state.draggingAnchorIndex = null;
  if (els.svg.hasPointerCapture(event.pointerId)) els.svg.releasePointerCapture(event.pointerId);
});

els.routeList.addEventListener('input', event => {
  const item = event.target.closest('.route-item');
  if (!item) return;
  const route = state.routes.find(candidate => candidate.id === Number(item.dataset.routeId));
  if (!route) return;
  selectRoute(route.id);
  if (event.target.classList.contains('route-color')) { route.color = event.target.value; renderRoutes(); }
  if (event.target.classList.contains('route-name')) route.name = event.target.value;
});
els.routeList.addEventListener('click', event => {
  const item = event.target.closest('.route-item');
  if (!item) return;
  const id = Number(item.dataset.routeId);
  const button = event.target.closest('.delete-route');
  if (button) {
    if (state.editingAnchors) setAnchorEditing(false);
    state.routes = state.routes.filter(route => route.id !== id);
    state.selectedRouteId = state.routes[0]?.id ?? null;
    renderRoutes();
    showToast('动线已删除');
    return;
  }
  selectRoute(id);
});

els.paletteButtons.addEventListener('click', event => {
  const button = event.target.closest('.palette-button');
  if (!button) return;
  if (state.drawing) { state.draftColor = button.dataset.color; renderDraft(); }
  else {
    const route = selectedRoute();
    if (route) { route.color = button.dataset.color; renderRoutes(); }
  }
  renderPalette();
});

els.lineWidth.addEventListener('input', event => { state.lineWidth = Number(event.target.value); els.lineWidthValue.textContent = `${state.lineWidth} px`; renderRoutes(); });
els.speed.addEventListener('input', event => { state.speed = Number(event.target.value); els.speedValue.textContent = `${state.speed.toFixed(1)}×`; renderRoutes(); });
els.loop.addEventListener('change', event => { state.loop = event.target.checked; startAnimation(); });
els.preview.addEventListener('click', () => { if (state.editingAnchors) setAnchorEditing(false); startAnimation(); });
els.exportMp4.addEventListener('click', exportMp4);
els.exportPng.addEventListener('click', exportPng);
els.exportHtml.addEventListener('click', exportHtml);
els.reset.addEventListener('click', resetExample);
window.addEventListener('keydown', event => {
  if ((event.key === 'Delete' || event.key === 'Backspace') && state.editingAnchors && !event.target.matches('input')) deleteSelectedAnchor();
});

renderRoutes();
