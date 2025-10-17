const canvas = document.getElementById('globeCanvas');
const ctx = canvas.getContext('2d');


let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let lastTouchX = 0;
let lastTouchY = 0;

let zoomScale = 1.0;
let targetZoom = 1.0;

const MIN_SCALE = 0.5;
const MAX_SCALE = 80000.0;

let rotationLon = Math.PI;  // стартовый поворот (Гринвич по центру)
let rotationLat = 0;        // наклон
let lastPinchDistance = 0;  // стартовый

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const centerX = () => canvas.width / 2;
const centerY = () => canvas.height / 2;
const RADIUS = () => Math.min(canvas.width, canvas.height) * 0.35 * zoomScale;

// === ПРОЕКЦИЯ lat/lon -> 2D ===
function projectLatLon(lat, lon) {
  const radLat = lat * Math.PI / 180;
  const radLon = lon * Math.PI / 180;

  // исходные 3D координаты
  let x3d = Math.cos(radLat) * Math.cos(radLon);
  let y3d = Math.sin(radLat);
  let z3d = Math.cos(radLat) * Math.sin(radLon);

  // зеркалим чтобы долгота 0 шла вправо
  z3d = -z3d;

  // === Сначала вращение по долготе (ось Y) ===
  let x1 = x3d * Math.cos(rotationLon) + z3d * Math.sin(rotationLon);
  let y1 = y3d;
  let z1 = -x3d * Math.sin(rotationLon) + z3d * Math.cos(rotationLon);

  // === Потом наклон по широте (ось X) ===
  let y2 = y1 * Math.cos(rotationLat) - z1 * Math.sin(rotationLat);
  let z2 = y1 * Math.sin(rotationLat) + z1 * Math.cos(rotationLat);
  let x2 = x1;

  const visible = z2 > 0;
  const x2d = centerX() + RADIUS() * x2;
  const y2d = centerY() - RADIUS() * y2;
  return { x: x2d, y: y2d, visible };
}

// === ОБРАТНАЯ ПРОЕКЦИЯ: экран -> lat/lon ===
function screenToLatLon(mouseX, mouseY) {
  const nx = (mouseX - canvas.width / 2) / RADIUS();
  const ny = (mouseY - canvas.height / 2) / RADIUS();
  const r2 = nx * nx + ny * ny;
  if (r2 > 1) return null;

  let z = Math.sqrt(1 - r2);
  let x = nx;
  let y = -ny;

  // === Обратное вращение по широте (X) ===
  {
    const cosLat = Math.cos(-rotationLat);
    const sinLat = Math.sin(-rotationLat);
    const yTmp = y * cosLat - z * sinLat;
    const zTmp = y * sinLat + z * cosLat;
    y = yTmp;
    z = zTmp;
  }

  // === Обратное вращение по долготе (Y) ===
  {
    const cosLon = Math.cos(-rotationLon);
    const sinLon = Math.sin(-rotationLon);
    const xTmp = x * cosLon + z * sinLon;
    const zTmp = -x * sinLon + z * cosLon;
    x = xTmp;
    z = zTmp;
  }

  // зеркалим обратно
  z = -z;

  const lat = Math.asin(y) * 180 / Math.PI;
  const lon = Math.atan2(z, x) * 180 / Math.PI;
  return { lat, lon };
}

// === Рисуем сетку ===
function drawGrid() {
  ctx.strokeStyle = "rgba(0,0,0,0.30)";
  ctx.lineWidth = 1;

  // линии широт
  for (let lat = -60; lat <= 60; lat += 30) {
    let prev = null;
    for (let lon = -180; lon <= 180; lon += 5) {
      const p = projectLatLon(lat, lon);
      if (!p.visible) { prev = null; continue; }
      if (prev) {
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      prev = p;
    }
  }

  // линии долгот
  for (let lon = -150; lon <= 180; lon += 30) {
    let prev = null;
    for (let lat = -90; lat <= 90; lat += 5) {
      const p = projectLatLon(lat, lon);
      if (!p.visible) { prev = null; continue; }
      if (prev) {
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      prev = p;
    }
  }
}

// === Основной рендер ===
function drawGlobe() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(centerX(), centerY(), RADIUS(), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6,66,115, 0.28)';   // чёрный как фон страницы
  ctx.fill();
}

function drawLandBorders() {
  ctx.fillStyle = COLOR_COUNTRY_FILL;
  ctx.strokeStyle = COLOR_COUNTRY_STROKE; // getDynamicColor();
  ctx.lineWidth = 0.2;
  for (const polyset of landBorders) {
  fillPolyset(polyset, projectLatLon, ctx);
  strokePolyset(polyset, projectLatLon, ctx);
  }
  ctx.restore();
}
