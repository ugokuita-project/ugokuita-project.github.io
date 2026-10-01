import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const overlay = document.querySelector('.launch-intro');
const replay = document.querySelector('.intro-replay');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
if (overlay && !motion.matches) startIntro();

async function startIntro() {
  let renderer, frame, timer, done = false;
  const controller = new AbortController();
  const hide = () => {
    cancelAnimationFrame(frame);
    overlay.classList.remove('is-active', 'is-running', 'is-leaving');
    overlay.dataset.state = 'finished';
  };
  // Slow networks, missing assets, or unavailable WebGL must never hide the site indefinitely.
  timer = setTimeout(() => { done = true; controller.abort(); hide(); }, 5000);
  try {
    overlay.classList.add('is-active');
    overlay.dataset.state = 'loading';
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .95;
    overlay.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const environment = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envMap = environment.fromScene(room, 0.04);
    scene.environment = envMap.texture;
    room.dispose();
    environment.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x24242b, .55));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(1, 3, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8edff, 1.8);
    rim.position.set(-2, 1, -2);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 30);
    function resize() {
      const distance = innerWidth < innerHeight ? 2.2 : 1.45;
      camera.position.set(distance, distance * .65, distance * 1.2);
      camera.lookAt(0, .12, 0);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    }
    resize();
    const response = await fetch(overlay.dataset.model, { signal: controller.signal });
    if (!response.ok) throw new Error('Model unavailable');
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
    if (done || motion.matches) { renderer.dispose(); hide(); return; }
    clearTimeout(timer);
    const model = gltf.scene;
    // CAD's RGB swatches were exported as linear colors. Restore the authored swatch
    // appearance, then distinguish metal, polymer and rubber under studio lighting.
    const adjusted = new Set();
    model.traverse(node => {
      if (!node.isMesh) return;
      const material = node.material;
      if (adjusted.has(material)) return;
      adjusted.add(material);
      const brightness = Math.max(material.color.r, material.color.g, material.color.b);
      material.color.convertSRGBToLinear();
      material.specularColor?.set(0xffffff);
      material.specularIntensity = 1;
      const metal = /Aluminum|Steel/i.test(material.name);
      const polymer = /Nylon|ABS|Glass/i.test(material.name);
      material.metalness = metal ? .95 : polymer ? .05 : brightness > .5 ? .75 : .15;
      material.roughness = metal ? .22 : polymer ? .48 : brightness > .5 ? .28 : .42;
      material.envMapIntensity = 1;
    });
    // Rubber tires retain dark, rough surfaces instead of inheriting CAD's metallic default.
    model.traverse(node => {
      if (!node.name.startsWith('wheel-')) return;
      node.traverse(part => { if (part.isMesh && part.material.color.getHSL({}).l < .25) {
        part.material = part.material.clone();
        part.material.metalness = 0;
        part.material.roughness = .82;
        part.material.color.setRGB(.018, .02, .023);
      }});
    });
    // The game model exposes the internal frame. Restore the silver deck shown
    // in the project header, fitted inside the original frame (meters).
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(.635, .008, .463),
      new THREE.MeshStandardMaterial({ color: 0xaeb4ba, metalness: .9, roughness: .25 })
    );
    deck.name = 'photo-reference-aluminum-deck';
    deck.position.set(-.008, .265, 0);
    model.add(deck);
    scene.add(model);
    const wheels = [];
    model.traverse(node => { if (node.name.startsWith('wheel-')) wheels.push(node); });
    if (wheels.length !== 4) throw new Error('Expected four model wheel assemblies');
    overlay.dataset.wheels = String(wheels.length);
    // Tangent-continuous, broad turns. The chassis follows travel direction rather
    // than pivoting in place; steering comes from curvature and the real wheelbase.
    const v = (x, z) => new THREE.Vector3(x, 0, z);
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(v(-2, -.65), v(-.4, -.65)));
    path.add(new THREE.CubicBezierCurve3(v(-.4, -.65), v(.65, -.65), v(.65, .65), v(-.4, .65)));
    path.add(new THREE.CubicBezierCurve3(v(-.4, .65), v(-1.45, .65), v(-1.45, -.65), v(-.4, -.65)));
    path.add(new THREE.LineCurve3(v(-.4, -.65), v(2.2, -.65)));
    const trailMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false });
    const trails = [-.1885, .1885].map(z => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 18), 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(40 * 18), 3).setUsage(THREE.DynamicDrawUsage));
      const mesh = new THREE.Mesh(geometry, trailMaterial);
      mesh.frustumCulled = false;
      scene.add(mesh);
      return { mesh, z, history: [] };
    });
    const duration = 5200;
    let began, previousPosition, previousHeading;
    const previousWheelPositions = new Map();
    function animate(now) {
      const progress = Math.min((now - began) / duration, 1);
      const travel = progress * progress * (3 - 2 * progress);
      const point = path.getPointAt(travel);
      const tangent = path.getTangentAt(travel);
      const heading = Math.atan2(-tangent.z, tangent.x);
      model.position.copy(point);
      model.rotation.y = heading;
      const distance = point.distanceTo(previousPosition);
      const turn = Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading));
      const curvature = distance > .00001 ? turn / distance : 0;
      for (const wheel of wheels) {
        const wheelPoint = wheel.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(point);
        const last = previousWheelPositions.get(wheel);
        if (last) wheel.rotation.z -= wheelPoint.distanceTo(last) / wheel.userData.radius;
        previousWheelPositions.set(wheel, wheelPoint);
        if (wheel.name.startsWith('wheel-front')) {
          const steering = Math.atan2(.351 * curvature, 1 + wheel.position.z * curvature);
          wheel.rotation.y = THREE.MathUtils.clamp(steering, -.65, .65);
        }
      }
      previousPosition.copy(point);
      previousHeading = heading;
      for (const trail of trails) {
        const wheelPoint = new THREE.Vector3(-.22, .012, trail.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(point);
        trail.history.push(wheelPoint);
        if (trail.history.length > 41) trail.history.shift();
        const positions = trail.mesh.geometry.attributes.position;
        const colors = trail.mesh.geometry.attributes.color;
        let vertex = 0;
        for (let i = 1; i < trail.history.length; i++) {
          const a = trail.history[i - 1], b = trail.history[i];
          const normal = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(.006);
          const corners = [a.clone().add(normal), a.clone().sub(normal), b.clone().add(normal), b.clone().add(normal), a.clone().sub(normal), b.clone().sub(normal)];
          const fade = i / trail.history.length;
          for (const corner of corners) {
            positions.setXYZ(vertex, corner.x, corner.y, corner.z);
            colors.setXYZ(vertex++, fade, .025 * fade, .04 * fade);
          }
        }
        trail.mesh.geometry.setDrawRange(0, vertex);
        positions.needsUpdate = true;
        colors.needsUpdate = true;
      }
      renderer.render(scene, camera);
      if (progress > .92) overlay.classList.add('is-leaving');
      if (progress < 1) frame = requestAnimationFrame(animate);
      else hide();
    }
    function play() {
      if (motion.matches || document.hidden) { hide(); return; }
      cancelAnimationFrame(frame);
      overlay.classList.remove('is-leaving');
      overlay.classList.add('is-active', 'is-running');
      overlay.dataset.state = 'running';
      resize();
      previousPosition = path.getPointAt(0);
      const startTangent = path.getTangentAt(0);
      previousHeading = Math.atan2(-startTangent.z, startTangent.x);
      trails.forEach(trail => { trail.history.length = 0; });
      previousWheelPositions.clear();
      began = performance.now();
      frame = requestAnimationFrame(animate);
    }
    replay.hidden = false;
    replay.addEventListener('click', play);
    motion.addEventListener('change', () => { if (motion.matches) hide(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
    window.addEventListener('pagehide', () => { hide(); renderer.dispose(); envMap.dispose(); });
    play();
  } catch (error) {
    clearTimeout(timer);
    hide();
    renderer?.dispose();
    console.warn('Product intro skipped:', error.message);
  }
}
