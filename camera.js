// === ВСПОМОГАТЕЛЬНАЯ ВЕКТОРНАЯ МАТЕМАТИКА ===
const vadd = (a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const vsub = (a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const vmul = (a,s)=>({x:a.x*s,y:a.y*s,z:a.z*s});
const vdot = (a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const vcross = (a,b)=>({x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x});
const vlen = (a)=>Math.hypot(a.x,a.y,a.z);
const vnorm = (a)=>{const L=vlen(a)||1; return {x:a.x/L,y:a.y/L,z:a.z/L};};

// Ортонормированный базис в касательной плоскости к точке center (на единичной сфере)
function makeTangentBasis(center){
  // Выбираем «север», чтобы не был почти коллинеарен с center
  const north = (Math.abs(center.y) < 0.9) ? {x:0,y:1,z:0} : {x:1,y:0,z:0};
  let u = vnorm(vcross(north, center));   // первый тангенс
  let v = vnorm(vcross(center, u));       // второй тангенс (ортогонален u и center)
  return {u, v};
}

// Проекция в экранные координаты через ваши утилиты
function projectVecToScreen(vec){
  // Если у тебя есть готовая project(vec) — используй её.
  // Универсально через lat/lon:
  const {lat, lon} = vecToLatLon(vec);
  return projectLatLon(lat, lon); // {x,y,visible}
}

// === ГЕОДЕЗИЧЕСКИЙ КРУГ НА СФЕРЕ (как у взрыва) ===
// centerVec — единичный вектор центра круга (например, pl.pos)
// angRad — угловой радиус в РАДИАНАХ (radiusKm / EARTH_RADIUS_KM)
// samples — плотность полилинии
function drawPlayerViewAreaGeodesic(ctx, centerVec, angRad, {samples=160, alpha=0.9} = {}){
  const {u, v} = makeTangentBasis(centerVec);
  const ca = Math.cos(angRad), sa = Math.sin(angRad);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Мягкое свечение
  ctx.strokeStyle = `rgba(0, 180, 255, ${0.25*alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let penDown = false;

  for (let i = 0; i <= samples; i++){
    const t = (i / samples) * Math.PI * 2;
    // Точка на малом круге: p = ca*C + sa*(cos t * v + sin t * u)
    const p = vadd( vmul(centerVec, ca), vadd( vmul(v, sa*Math.cos(t)), vmul(u, sa*Math.sin(t)) ) );
    const s = projectVecToScreen(p);
    if (!s || !s.visible){ penDown = false; continue; }
    if (!penDown){ ctx.moveTo(s.x, s.y); penDown = true; }
    else { ctx.lineTo(s.x, s.y); }
  }
  ctx.stroke();

  // Основной контур
  ctx.strokeStyle = `rgba(0, 210, 255, ${alpha})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  penDown = false;
  for (let i = 0; i <= samples; i++){
    const t = (i / samples) * Math.PI * 2;
    const p = vadd( vmul(centerVec, ca), vadd( vmul(v, sa*Math.cos(t)), vmul(u, sa*Math.sin(t)) ) );
    const s = projectVecToScreen(p);
    if (!s || !s.visible){ penDown = false; continue; }
    if (!penDown){ ctx.moveTo(s.x, s.y); penDown = true; }
    else { ctx.lineTo(s.x, s.y); }
  }
  ctx.stroke();

  ctx.restore();
}

function drawPlayerViewArea(){
    const pl = planesById.get(controlledId);
        if (pl) {
          // Радиус обзора в километрах (пример: 200 км)
          const radiusKm = INIT_VIEW_AREA_KM;

          // Угловой радиус (в радианах) — как у взрывов:
          const angRad = radiusKm / EARTH_RADIUS_KM;

          // Рисуем поверх всех объектов UI
          drawPlayerViewAreaGeodesic(ctx, pl.pos, angRad, { samples: 192, alpha: 0.95 });
        }
    }

// Радиус зоны в км (можешь менять на лету)
const VIEW_ZONE = {
  radiusKm: INIT_VIEW_AREA_KM,
  cosThresh: Math.cos(INIT_VIEW_AREA_KM / EARTH_RADIUS_KM), // порог по dot(a,b)
  ids: new Set(),         // текущий набор id внутри зоны
  peers: new Set(),
  prevIds: new Set(),     // прошлый набор — чтобы отслеживать вход/выход
};

// Если меняешь радиус — не забудь обновить cosThresh
function setViewZoneRadiusKm(rKm) {
  VIEW_ZONE.radiusKm = rKm;
  VIEW_ZONE.cosThresh = Math.cos(rKm / EARTH_RADIUS_KM);
}

function updatePlayerViewZone(centerVec, { includeSelf = false, includeNPC = true } = {}) {
  // Перекинем текущий набор в prevIds и начнём собирать новый
  VIEW_ZONE.prevIds = VIEW_ZONE.ids;
  VIEW_ZONE.ids = new Set();

  const cosT = VIEW_ZONE.cosThresh;

  // Быстрый dot без нормализации: pos у тебя уже единичный вектор
  for (const [id, pl] of planesById) {
    if (!pl || !pl.pos) continue;

    // опциональные фильтры
    if (!includeSelf && id === controlledId) continue;
    if (!includeNPC && typeof id === "string" && id.startsWith("npc")) continue;

    // внутри, если угол между векторами ≤ angRad, т.е. dot ≥ cos(angRad)
    const dot = (centerVec.x*pl.pos.x + centerVec.y*pl.pos.y + centerVec.z*pl.pos.z);
    if (dot >= cosT) VIEW_ZONE.ids.add(id);
  }

  // найдём, кто вошёл/вышел (дифф)
  const entered = [];
  const exited  = [];
  for (const id of VIEW_ZONE.ids) if (!VIEW_ZONE.prevIds.has(id)) entered.push(id);
  for (const id of VIEW_ZONE.prevIds) if (!VIEW_ZONE.ids.has(id)) exited.push(id);

  return { entered, exited, inside: VIEW_ZONE.ids };
}

// utils
function isInViewZone(id) {
  return VIEW_ZONE.ids.has(id);
}

function updateViewZonePeers() {
    VIEW_ZONE.peers = new Set();
    for (const id of VIEW_ZONE.ids) if (!id.startsWith("npc") && id !== my_uuid) VIEW_ZONE.peers.add(id);
}

function getViewZoneListSortedByDistance(centerVec, limit = Infinity) {
  // аккуратная сортировка: используем dot (чем БОЛЬШЕ dot, тем ближе по дуге)
  const arr = [];
  for (const id of VIEW_ZONE.ids) {
    const p = planesById.get(id);
    if (!p || !p.pos) continue;
    const dot = (centerVec.x*p.pos.x + centerVec.y*p.pos.y + centerVec.z*p.pos.z);
    // при необходимости можно посчитать точную дуговую дистанцию:
    // const distKm = EARTH_RADIUS_KM * Math.acos(Math.min(1, Math.max(-1, dot)));
    arr.push({ id, dot });
  }
  arr.sort((a,b) => b.dot - a.dot);
  if (arr.length > limit) arr.length = limit;
  return arr.map(o => o.id);
};

function updateViewZone() {
    const me = planesById.get(controlledId);
    if (me && me.pos) {
      // 1) обновим список
      const { entered, exited, inside } = updatePlayerViewZone(me.pos, {
        includeSelf: true,
        includeNPC: true,
      });
//      console.log(inside) OK TESTED
      updateViewZonePeers();
    }
}


// === ОБРАБОТЧИКИ МЫШИ ===
canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

function getCoordinates(screenX, screenY) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = screenX - rect.left;
  const mouseY = screenY - rect.top;
  const latlon = screenToLatLon(mouseX, mouseY);
  if (!latlon) return;
  return latlon;
}

canvas.addEventListener('mouseup', (e) => {
  isDragging = false;
  getCoordinates(e.clientX, e.clientY)
  });

canvas.addEventListener('mouseleave', () => { isDragging = false; });

canvas.addEventListener('mousemove', (e) => {
  setCursorHint(getCoordinates(e.clientX, e.clientY));
  if (!isDragging) return;
  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;
  // вращаем по долготе и широте
  const moveSpeed = 0.005 / zoomScale;

  rotationLon += deltaX * moveSpeed;
  rotationLat += deltaY * moveSpeed;

  // Ограничение наклона ±90°
  const maxLat = Math.PI / 2 - 0.01;
  if (rotationLat > maxLat) rotationLat = maxLat;
  if (rotationLat < -maxLat) rotationLat = -maxLat;

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

// === ОБРАБОТЧИКИ ТАЧЕЙ ДЛЯ ANDROID ===
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    isDragging = true;
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) lastPinchDistance = 0;
  if (e.touches.length === 0) isDragging = false;
});

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    // два пальца -> pinch zoom
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const distance = Math.sqrt(dx*dx + dy*dy);

    if (lastPinchDistance !== 0) {
      const scaleFactor = distance > lastPinchDistance ? 1.05 : 0.95;
      zoomScale *= scaleFactor;
      zoomScale = Math.min(Math.max(zoomScale, MIN_SCALE), MAX_SCALE);
    }
    lastPinchDistance = distance;
    e.preventDefault();
    return;
  }

  // Обычный drag одним пальцем
  if (!isDragging || e.touches.length !== 1) return;
  const touchX = e.touches[0].clientX;
  const touchY = e.touches[0].clientY;

  const deltaX = touchX - lastTouchX;
  const deltaY = touchY - lastTouchY;

  const moveSpeed = 0.005 / zoomScale;

  rotationLon += deltaX * moveSpeed;
  rotationLat += deltaY * moveSpeed;

  const maxLat = Math.PI / 2 - 0.01;
  if (rotationLat > maxLat) rotationLat = maxLat;
  if (rotationLat < -maxLat) rotationLat = -maxLat;

  lastTouchX = touchX;
  lastTouchY = touchY;

  e.preventDefault();
}, { passive: false });

// === ЗУМ колесом мыши ===
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
  zoomScale *= scaleFactor;
  zoomScale = Math.min(Math.max(zoomScale, MIN_SCALE), MAX_SCALE);
}, { passive: false });

// Отключаем контекстное меню (правый клик)
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  return false;
});

// === Camera Modes ===
let cameraMode = "follow";   // "free" | "follow"
let cameraTarget = { lat: 0, lon: 0 };

// --- Навести "камеру" (глобус) на вектор v (позиция на сфере) ---
function aimViewAtVector(v, smooth = 0) {
  // учтём зеркалирование по Z, как в projectLatLon(...)
  const x = v.x, y = v.y, z = -v.z;

  // сначала поворот по долготе: крутим вокруг Y так, чтобы x -> 0
  const targetLon = Math.atan2(-x, z);

  // после этого остаточный "вперёд" (z1) и тангаж по широте
  const z1 = -x * Math.sin(targetLon) + z * Math.cos(targetLon);
  let targetLat = Math.atan2(y, z1);

  // ограничение как в drag-обработчиках
  const maxLat = Math.PI / 2 - 0.01;
  if (targetLat > maxLat) targetLat = maxLat;
  if (targetLat < -maxLat) targetLat = -maxLat;

  if (smooth > 0) {
    rotationLon = rotateTowards(rotationLon, targetLon, smooth);
    rotationLat = rotateTowards(rotationLat, targetLat, smooth);
  } else {
    rotationLon = targetLon;
    rotationLat = targetLat;
  }
}

function rotateTowards(cur, tgt, k) {
  return cur + shortestAngle(tgt - cur) * Math.min(Math.max(k, 0), 1);
}
function shortestAngle(a) { // в диапазон [-PI, PI]
  while (a <= -Math.PI) a += 2*Math.PI;
  while (a >   Math.PI) a -= 2*Math.PI;
  return a;
}

// --- Навести на мой самолёт (разово или с плавным следованием) ---
function centerOnMyPlane(smooth = 0) {
  const pl = planesById.get(controlledId);
  if (!pl) return;
  aimViewAtVector(pl.pos, smooth);
}

// === 1) Наводим камеру вперёд по курсу самолёта ===
function centerAheadOfMyPlane(lookAheadKm = 1500, smooth = 0) {
  const pl = planesById.get(controlledId);
  if (!pl) return;

  const forward = forwardPointOnSphere(pl.pos, pl.heading, lookAheadKm);
  aimViewAtVector(forward, smooth);
    // плавный зум на игрока
  targetZoom = 14.8 - pl.speed*2; // чем быстрее лечу — тем сильнее отдаляет TODO BIG VALUES EXEPT
  zoomScale = zoomScale + (targetZoom - zoomScale) * clamp(smooth, 0, 1);
}

// === 2) Точка на сфере «вперёд» по курсу на дуговом расстоянии ===
// pos: {x,y,z} — единичный вектор позиции самолёта на сфере
// headingDeg — курс самолёта в градусах
// lookAheadKm — сколько км вперёд смотреть
function forwardPointOnSphere(pos, headingDeg, lookAheadKm) {
  const R = (typeof EARTH_RADIUS_KM !== 'undefined') ? EARTH_RADIUS_KM : 6371;
  const δ = (lookAheadKm / R);             // угловая дистанция (радианы)

  // Нормализуем позицию на всякий случай
  let P = normalize3(pos);

  // Локальный «север» (градиент широты): проекция глобального Y на касательную плоскость
  const Y = {x:0, y:1, z:0};
  let N = sub3(Y, mul3(P, dot3(P, Y)));    // убираем нормаль
  N = normalize3(N);

  // Локальный «восток»: E = N × P (правило правой руки)
  let E = cross3(N, P);
  E = normalize3(E);

  // Переводим курс в радианы. Формула ниже ожидает 0° = СЕВЕР, по часовой = на ВОСТОК.
  // Если у тебя 0° = ВОСТОК и растёт против часовой, раскомментируй конверсию:
  // const θ = (Math.PI/2) - headingDeg * Math.PI/180;
  const θ = headingDeg * Math.PI/180;

  // Единичное направление «вперёд» в касательной плоскости
  const F = add3( mul3(N, Math.cos(θ)), mul3(E, Math.sin(θ)) );

  // Смещаемся по большой окружности: P' = P*cosδ + F*sinδ
  const P2 = normalize3( add3( mul3(P, Math.cos(δ)), mul3(F, Math.sin(δ)) ) );
  return P2;
}

// === 3) Вспомогательные векторные функции ===
function dot3(a,b){ return a.x*b.x + a.y*b.y + a.z*b.z; }
function add3(a,b){ return {x:a.x+b.x, y:a.y+b.y, z:a.z+b.z}; }
function sub3(a,b){ return {x:a.x-b.x, y:a.y-b.y, z:a.z-b.z}; }
function mul3(a,k){ return {x:a.x*k, y:a.y*k, z:a.z*k}; }
function len3(a){ return Math.hypot(a.x, a.y, a.z); }
function normalize3(a){ const L=len3(a)||1; return {x:a.x/L, y:a.y/L, z:a.z/L}; }
function cross3(a,b){ return {x:a.y*b.z - a.z*b.y, y:a.z*b.x - a.x*b.z, z:a.x*b.y - a.y*b.x}; }
