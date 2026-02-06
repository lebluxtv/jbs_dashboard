/* global THREE */
(() => {
  const VERSION = "JB-TOWER-JS v1.0.0 (no-import)";

  const verEl = document.getElementById("ver");
  const errBox = document.getElementById("err");

  function showErr(msg) {
    errBox.style.display = "block";
    errBox.textContent = msg;
    verEl.textContent = VERSION + " — ERREUR (voir bas)";
  }

  // Preuve immédiate que c'est CE fichier qui tourne
  console.log(VERSION, "loaded at", new Date().toISOString());
  verEl.textContent = VERSION + " — OK";

  if (!window.THREE) {
    showErr(
      "THREE introuvable.\n" +
      "- Le CDN est bloqué (réseau / sécurité)\n" +
      "- Ou ton navigateur/CEF bloque https depuis file://\n" +
      "Fix: mettre three.min.js + OrbitControls.js en local, ou utiliser http local."
    );
    return;
  }

  if (!THREE.OrbitControls) {
    showErr(
      "OrbitControls introuvable (THREE.OrbitControls).\n" +
      "Le fichier OrbitControls.js ne s'est pas chargé."
    );
    return;
  }

  const canvas = document.getElementById("c");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a12);
  scene.fog = new THREE.FogExp2(0x070a12, 0.0009);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    20000
  );
  camera.position.set(450, 520, 650);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 420, 0);

  // Lights
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(800, 1200, 600);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-900, 400, -700);
  scene.add(fill);

  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 8000),
    new THREE.MeshStandardMaterial({
      color: 0x05070d,
      roughness: 0.92,
      metalness: 0.05,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // --------- Tower spec ---------
  const FLOORS = 400;
  const FLOORS_PER_MODULE = 10;

  const baseWidth = 220;
  const baseDepth = 220;
  const floorHeight = 3.6;
  const slabThickness = 0.9;

  const shrinkPerModule = 0.032; // 3.2% / module (10 étages)
  const rotPerModule = THREE.MathUtils.degToRad(45);

  const supportsTransmission =
    THREE.MeshPhysicalMaterial &&
    "transmission" in THREE.MeshPhysicalMaterial.prototype;

  const glassMat = supportsTransmission
    ? new THREE.MeshPhysicalMaterial({
        color: 0xbfd6ff,
        roughness: 0.08,
        metalness: 0.0,
        transmission: 0.95,
        thickness: 1.2,
        ior: 1.5,
        transparent: true,
        opacity: 1.0,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x9cc7ff,
        roughness: 0.12,
        metalness: 0.1,
        transparent: true,
        opacity: 0.35,
      });

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x0b1020,
    roughness: 0.85,
    metalness: 0.08,
  });

  const floorGeo = new THREE.BoxGeometry(baseWidth, slabThickness, baseDepth);
  const floorsMesh = new THREE.InstancedMesh(floorGeo, glassMat, FLOORS);
  scene.add(floorsMesh);

  const core = new THREE.Mesh(
    new THREE.BoxGeometry(36, FLOORS * floorHeight * 0.98, 36),
    coreMat
  );
  core.position.set(0, (FLOORS * floorHeight) / 2, 0);
  scene.add(core);

  const tmp = new THREE.Object3D();

  for (let i = 0; i < FLOORS; i++) {
    const moduleIndex = Math.floor(i / FLOORS_PER_MODULE);

    const moduleScale = Math.max(0.08, Math.pow(1 - shrinkPerModule, moduleIndex));
    const ry = moduleIndex * rotPerModule;
    const y = i * floorHeight + slabThickness / 2 + 2;

    tmp.position.set(0, y, 0);
    tmp.rotation.set(0, ry, 0);
    tmp.scale.set(moduleScale, 1.0, moduleScale);
    tmp.updateMatrix();

    floorsMesh.setMatrixAt(i, tmp.matrix);
  }
  floorsMesh.instanceMatrix.needsUpdate = true;

  // Beacon
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(6, 24, 18),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.3,
      roughness: 0.25,
      metalness: 0.0,
    })
  );
  beacon.position.set(0, FLOORS * floorHeight + 34, 0);
  scene.add(beacon);

  // Loop
  const t0 = performance.now();
  function tick() {
    requestAnimationFrame(tick);
    controls.update();
    const t = (performance.now() - t0) * 0.001;
    beacon.material.emissiveIntensity = 1.15 + Math.sin(t * 2.2) * 0.35;
    renderer.render(scene, camera);
  }
  tick();

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
})();
