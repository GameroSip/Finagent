// Escenario del logo: la "F" de FinAgent como un objeto 3D metálico (three.js), con iluminación de estudio, una animación suave mientras carga
// y un despegue hacia arriba con estela. Si el teléfono no tiene WebGL se usa una versión plana con el mismo movimiento (CSS).
import { ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BufferAttribute, BufferGeometry, DirectionalLight, ExtrudeGeometry, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, Points, Scene, ShaderMaterial, Shape, SRGBColorSpace, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MARK_POINTS, markSvg } from './logo';

export interface LogoStage { webgl: boolean; ready: Promise<void>; launch(o?: { onReveal?: () => void }): Promise<void>; destroy(): void }

const reduced = (): boolean => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** Reloj del escenario. Las pruebas pueden reemplazarlo (window.__stageClock) para detener el despegue en un instante exacto y fotografiarlo. */
const clock = (): number => (globalThis as any).__stageClock?.() ?? performance.now();
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const POOL = 900;
const STEM_X = -31.6, BASE_Y = -52;                                   // el "motor": bajo el tronco de la F
const VERT = `attribute float aSize; attribute float aLife; varying float vLife;
void main(){ vLife = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * (520.0 / -mv.z) * (0.6 + 0.8 * (1.0 - aLife)); gl_Position = projectionMatrix * mv; }`;
const FRAG = `precision mediump float; varying float vLife;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vLife * 0.9;
  vec3 hot = vec3(1.0, 0.96, 0.82), warm = vec3(0.96, 0.58, 0.16), cool = vec3(0.55, 0.22, 0.08);
  vec3 c = vLife > 0.55 ? mix(warm, hot, (vLife - 0.55) / 0.45) : mix(cool, warm, vLife / 0.55); gl_FragColor = vec4(c * a, a); }`;

export function createLogoStage(host: HTMLElement): LogoStage {
  if (reduced()) return flatStage(host);                              // con "reducir movimiento" activado, el logo queda fijo
  let renderer: WebGLRenderer | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('sin WebGL');
  } catch { renderer = null; }
  return renderer ? webglStage(host, renderer) : flatStage(host);
}

function webglStage(host: HTMLElement, renderer: WebGLRenderer): LogoStage {
  const canvas = renderer.domElement;
  host.append(canvas);
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 0.8;
  const scene = new Scene(), camera = new PerspectiveCamera(30, 1, 10, 3000);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;           // reflejos de estudio: lo que le da aspecto de metal pulido
  scene.add(new AmbientLight(0xffffff, 0.25));
  const key = new DirectionalLight(0xfff1d8, 0.9); key.position.set(-160, 190, 180); scene.add(key);
  const rim = new DirectionalLight(0xbfd2ff, 0.9); rim.position.set(160, -40, -120); scene.add(rim);

  // La figura (misma que el isotipo 2D), con bisel para que las aristas capten la luz.
  const shape = new Shape();
  MARK_POINTS.forEach(([x, y], i) => { const px = x - 42.6, py = 50 - y; if (i) shape.lineTo(px, py); else shape.moveTo(px, py); });
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: 15, bevelEnabled: true, bevelThickness: 3.4, bevelSize: 2.8, bevelSegments: 9, steps: 1 });
  geo.center();
  const mat = new MeshPhysicalMaterial({ color: 0xB98F3E, metalness: 1, roughness: 0.46, clearcoat: 0.2, clearcoatRoughness: 0.4, envMapIntensity: 0.34 });   // latón satinado: refleja el estudio sin quemarse de frente
  const logo = new Mesh(geo, mat);
  scene.add(logo);

  // Estela del despegue
  const pos = new Float32Array(POOL * 3), size = new Float32Array(POOL), life = new Float32Array(POOL), norm = new Float32Array(POOL), vel = new Float32Array(POOL * 3), max = new Float32Array(POOL);
  const pg = new BufferGeometry();
  pg.setAttribute('position', new BufferAttribute(pos, 3)); pg.setAttribute('aSize', new BufferAttribute(size, 1)); pg.setAttribute('aLife', new BufferAttribute(norm, 1));   // vida normalizada (1 → 0), separada de la vida real en segundos
  const pm = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const trail = new Points(pg, pm); trail.frustumCulled = false; scene.add(trail);
  let cursor = 0;
  const emit = (x: number, y: number, speed: number) => {
    const i = cursor++ % POOL;
    pos[i * 3] = x + (Math.random() - 0.5) * 12; pos[i * 3 + 1] = y; pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    vel[i * 3] = (Math.random() - 0.5) * 22; vel[i * 3 + 1] = -speed * (0.55 + Math.random() * 0.7); vel[i * 3 + 2] = (Math.random() - 0.5) * 10;
    max[i] = 0.35 + Math.random() * 0.45; life[i] = max[i]; size[i] = 22 + Math.random() * 30;
  };

  let dist = 620, halfH = 166, alive = true, t0 = clock(), last = t0, acc = 0;
  let phase: 'idle' | 'launching' | 'gone' = 'idle', launchAt = 0, resolveLaunch: (() => void) | null = null, revealCb: (() => void) | undefined, revealed = false;
  const resize = () => {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight, aspect = w / h;
    renderer.setSize(w, h, false); camera.aspect = aspect;
    const visH = Math.max(500, 85 / (0.34 * aspect));                                  // el logo ocupa ~20 % del alto o ~34 % del ancho, lo que sea menor
    dist = visH / (2 * Math.tan((camera.fov * Math.PI) / 360)); halfH = visH / 2;
    camera.position.set(0, 0, dist); camera.updateProjectionMatrix();
  };
  resize(); addEventListener('resize', resize);

  const LIFT_AT = 0.5, A = 560;                                                         // segundos de encendido antes de elevarse; aceleración
  const frame = () => {
    if (!alive) return;
    const now = clock();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    if (phase === 'idle') {
      logo.rotation.y = Math.sin(t * 0.75) * 0.55; logo.rotation.x = -0.1 + Math.sin(t * 0.5) * 0.05; logo.position.y = Math.sin(t * 1.3) * 2.2;
    } else if (phase === 'launching') {
      const s = (now - launchAt) / 1000;
      const settle = Math.min(1, s / 0.4);                                              // se endereza mirando al frente
      logo.rotation.y *= 1 - 0.18 * settle; logo.rotation.x += (0.06 - logo.rotation.x) * 0.1;
      if (s < LIFT_AT) { const k = s / LIFT_AT; logo.position.x = (Math.random() - 0.5) * 1.6 * k; logo.position.y = (Math.random() - 0.5) * 1.6 * k; acc += (90 + k * 160) * dt; for (; acc >= 1; acc--) emit(STEM_X, logo.position.y + BASE_Y, 60 + k * 70); }
      else {
        const u = s - LIFT_AT; logo.position.x = 0; logo.position.y = 0.5 * A * u * u; logo.rotation.z = -0.03 * Math.min(1, u * 2);
        acc += 520 * dt; for (; acc >= 1; acc--) emit(STEM_X, logo.position.y + BASE_Y, 150 + u * 330);
        if (!revealed && u > 0.38) { revealed = true; revealCb?.(); }
        if (logo.position.y > halfH + 95 && phase === 'launching') { phase = 'gone'; logo.visible = false; }
      }
    }
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt; if (life[i] < 0) life[i] = 0;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    for (let i = 0; i < POOL; i++) norm[i] = max[i] ? life[i] / max[i] : 0;
    (pg.attributes.position as BufferAttribute).needsUpdate = true; (pg.attributes.aLife as BufferAttribute).needsUpdate = true; (pg.attributes.aSize as BufferAttribute).needsUpdate = true;
    renderer.render(scene, camera);
    if (phase === 'gone' && alive) { const any = life.some((v) => v > 0); if (!any) { phase = 'gone'; resolveLaunch?.(); resolveLaunch = null; } }
    if (alive) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const ready = new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  return {
    webgl: true, ready,
    launch(o = {}) {
      if (phase !== 'idle') return Promise.resolve();
      revealCb = o.onReveal;
      if (reduced()) { revealCb?.(); canvas.style.transition = 'opacity .35s'; canvas.style.opacity = '0'; return wait(380); }
      phase = 'launching'; launchAt = clock();
      return new Promise<void>((r) => { resolveLaunch = r; if (!(globalThis as any).__stageClock) setTimeout(r, 3500); });   // por las dudas, nunca queda trabado (salvo en las pruebas con reloj propio)
    },
    destroy() { alive = false; removeEventListener('resize', resize); geo.dispose(); mat.dispose(); pg.dispose(); pm.dispose(); pmrem.dispose(); renderer.dispose(); canvas.remove(); },
  };
}

/** Sin WebGL: la figura plana con el mismo movimiento (flotar y despegar). */
function flatStage(host: HTMLElement): LogoStage {
  const el = document.createElement('div');
  el.className = 'stage-flat';
  el.innerHTML = `<div class="sf-mark">${markSvg(84)}</div><i class="sf-flame"></i>`;
  host.append(el);
  return {
    webgl: false, ready: Promise.resolve(),
    async launch(o = {}) {
      if (reduced()) { o.onReveal?.(); el.style.transition = 'opacity .35s'; el.style.opacity = '0'; return wait(380); }
      el.classList.add('lift'); await wait(620); o.onReveal?.(); await wait(900);
    },
    destroy() { el.remove(); },
  };
}
