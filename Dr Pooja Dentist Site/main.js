/* ==========================================================================
   Dr. Pooja's Dental Studio - WebGL & Particle System Engine
   ========================================================================== */


// --------------------------------------------------------------------------
// 1. CONSTANTS & CONFIGURATION
// --------------------------------------------------------------------------
const PARTICLE_COUNT = 3000;
const SPRING_FACTOR = 0.08;
const DAMPING = 0.85;
const REPULSION_RADIUS = 0.8;
const REPULSION_STRENGTH = 0.4;
const DIAMOND_COLORS = [
  new THREE.Color('#ffffff'), // Platinum White
  new THREE.Color('#fbcfe8'), // Rose Gold
  new THREE.Color('#fcd34d'), // Champagne Gold
  new THREE.Color('#dfb15b')  // Premium Bronze/Gold
];
const GOLD_COLOR = new THREE.Color('#d4af37');    // Metallic Luxury Gold
const NERVE_COLOR = new THREE.Color('#be123c');   // Ruby Nerve Red
const SCAN_COLOR = new THREE.Color('#7c3aed');    // Velvet Amethyst
const CLEAN_COLOR = new THREE.Color('#e11d48');   // Clean Ruby Glow
const ALIGN_COLOR = new THREE.Color('#ec4899');   // Align Pink

// --------------------------------------------------------------------------
// 2. MATH & GEOMETRY GENERATORS (TOOTH & SMILE)
// --------------------------------------------------------------------------

// Generates 3D molar point coordinates
function generateToothPoints(count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    let x, y, z;
    const type = Math.random();
    
    if (type < 0.6) {
      // --- Crown Section (y from 0 to 1) ---
      const h = Math.random();
      const theta = Math.random() * Math.PI * 2;
      
      // Make crown boxy-rounded (molar contour)
      const maxR = 0.65 * (1.0 - 0.12 * Math.cos(4 * theta));
      // Distribute points deeper inside the crown volume
      const r = Math.pow(Math.random(), 0.75) * maxR;
      
      x = r * Math.cos(theta);
      z = r * Math.sin(theta);
      y = h;
      
      // Add molar cusps (4 peaks at the top crown rim)
      if (h > 0.5) {
        const cuspFactor = (h - 0.5) / 0.5;
        const cuspHeight = 0.18 * Math.sin(2 * theta) * (r / maxR) * cuspFactor;
        y += cuspHeight;
      }
      
      // Add slight top-center depression
      if (h > 0.8) {
        const centerFactor = (h - 0.8) / 0.2;
        const centerDepression = -0.08 * (1.0 - (r / maxR)) * centerFactor;
        y += centerDepression;
      }
    } else if (type < 0.8) {
      // --- Root 1 (Left Root, y from 0 down to -1.1) ---
      const h = -Math.random() * 1.1;
      const theta = Math.random() * Math.PI * 2;
      const rootProgress = -h / 1.1;
      
      // Root tapering
      const rootRadius = 0.22 * (1.0 - 0.75 * rootProgress);
      const r = Math.pow(Math.random(), 0.7) * rootRadius;
      
      // Slight inward curvature for organic root structure
      const rootCenterX = -0.28 + 0.08 * rootProgress;
      const rootCenterZ = 0.0;
      
      x = rootCenterX + r * Math.cos(theta);
      z = rootCenterZ + r * Math.sin(theta);
      y = h;
    } else {
      // --- Root 2 (Right Root, y from 0 down to -1.1) ---
      const h = -Math.random() * 1.1;
      const theta = Math.random() * Math.PI * 2;
      const rootProgress = -h / 1.1;
      
      // Root tapering
      const rootRadius = 0.22 * (1.0 - 0.75 * rootProgress);
      const r = Math.pow(Math.random(), 0.7) * rootRadius;
      
      // Curve inward
      const rootCenterX = 0.28 - 0.08 * rootProgress;
      const rootCenterZ = 0.0;
      
      x = rootCenterX + r * Math.cos(theta);
      z = rootCenterZ + r * Math.sin(theta);
      y = h;
    }
    
    // Scale slightly to look good in viewport
    points.push(new THREE.Vector3(x * 1.8, y * 1.8 + 0.3, z * 1.8));
  }
  return points;
}

// Generates 3D coordinates mapping a smile row
function generateSmilePoints(count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    // Distribute points along a wide horizontal arc
    const progress = (i / count) * 2.0 - 1.0; // -1 to 1
    const x = progress * 1.6;
    const y = -0.3 * (x * x) + 0.3; // parabolic smile curve
    const z = -0.45 * Math.cos(progress * Math.PI / 2); // depth curvature
    
    // Create tooth volume (simulated dentition blocks along the arc)
    const theta = Math.random() * Math.PI * 2;
    const thickness = Math.random() * 0.12;
    const ox = thickness * Math.cos(theta);
    const oy = thickness * Math.sin(theta);
    
    points.push(new THREE.Vector3(
      x + ox,
      y + oy,
      z + (Math.random() * 0.06 - 0.03)
    ));
  }
  return points;
}

// --------------------------------------------------------------------------
// 3. ENGINE INITIALIZATION (HELPER CLASS)
// --------------------------------------------------------------------------
class ParticleEngine {
  constructor(canvasId, containerElement = null) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas && containerElement) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = canvasId;
      containerElement.appendChild(this.canvas);
    }
    
    this.parent = this.canvas.parentElement;
    this.width = this.parent.clientWidth;
    this.height = this.parent.clientHeight;
    
    // System setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 100);
    this.camera.position.z = 6;
    
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Data structures for physics
    this.particles = [];
    this.targetPositions = generateToothPoints(PARTICLE_COUNT);
    this.smilePositions = generateSmilePoints(PARTICLE_COUNT);
    this.currentMode = 'tooth'; // tooth, scan, clean, align
    
    // Mouse tracking variables
    this.mouse = new THREE.Vector2();
    this.mouse3D = new THREE.Vector3(999, 999, 999);
    this.raycaster = new THREE.Raycaster();
    this.interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    
    // Animation flags
    this.scanPlaneY = 0;
    this.scanDirection = 1;
    this.sparkles = [];
    this.isHovered = false;
    
    // Metrics (for lab canvas)
    this.fps = 60;
    this.lastTime = performance.now();
    this.frames = 0;
    
    this.initParticles();
    this.initReferenceMesh();
    this.initNerves();
    this.setupEvents();
    this.animate();
  }
  
  initParticles() {
    // Setup particle storage structure
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const toothPos = this.targetPositions[i];
      
      // Select a random elegant diamond/sapphire color for each particle
      const baseColor = DIAMOND_COLORS[Math.floor(Math.random() * DIAMOND_COLORS.length)];
      
      // Swirling cylinder vortex initial state (Teeth Generation animation)
      const theta = Math.random() * Math.PI * 2;
      const R = 8 + Math.random() * 8; // scattered far away in a cylinder ring
      const Y = (Math.random() - 0.5) * 12;
      
      const startX = R * Math.cos(theta);
      const startY = Y;
      const startZ = R * Math.sin(theta);
      
      // Inject orbital velocity for the swirl effect
      const speed = 0.15 + Math.random() * 0.1;
      const vx = -Math.sin(theta) * speed;
      const vz = Math.cos(theta) * speed;
      const vy = (Math.random() - 0.5) * 0.05;
      
      this.particles.push({
        x: startX,
        y: startY,
        z: startZ,
        vx: vx,
        vy: vy,
        vz: vz,
        tx: toothPos.x,
        ty: toothPos.y,
        tz: toothPos.z,
        r: baseColor.r,
        g: baseColor.g,
        b: baseColor.b,
        tr: baseColor.r,
        tg: baseColor.g,
        tb: baseColor.b,
        baseR: baseColor.r,
        baseG: baseColor.g,
        baseB: baseColor.b
      });
      
      positions[i * 3] = startX;
      positions[i * 3 + 1] = startY;
      positions[i * 3 + 2] = startZ;
      
      colors[i * 3] = baseColor.r;
      colors[i * 3 + 1] = baseColor.g;
      colors[i * 3 + 2] = baseColor.b;
    }
    
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Shader/Material configuration (circular particles)
    const texture = this.createCircleTexture();
    this.material = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      map: texture,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    this.pointCloud = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.pointCloud);
  }

  initReferenceMesh() {
    this.referenceMeshGroup = new THREE.Group();

    // 1. Crown Geometry (cylinder height 1, base at y=0, top at y=1)
    const crownGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.0, 16, 4, true);
    const pos = crownGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Make boxy molar shape
      const theta = Math.atan2(z, x);
      const maxR = 0.65 * (1.0 - 0.12 * Math.cos(4 * theta));
      
      // Scale x/z
      x = maxR * Math.cos(theta);
      z = maxR * Math.sin(theta);

      // Shift bottom to y=0
      y += 0.5;

      // Add cusps at top (y > 0.5)
      if (y > 0.5) {
        const cuspFactor = (y - 0.5) / 0.5;
        y += 0.18 * Math.sin(2 * theta) * cuspFactor;
      }
      
      // Top center depression
      if (y > 0.8) {
        const centerFactor = (y - 0.8) / 0.2;
        const currentR = Math.sqrt(x*x + z*z);
        y -= 0.08 * (1.0 - (currentR / maxR)) * centerFactor;
      }

      pos.setXYZ(i, x, y, z);
    }
    crownGeo.computeVertexNormals();

    // 2. Root 1 Geometry (cylinder height 1.1, top at y=0, bottom at y=-1.1)
    const root1Geo = new THREE.CylinderGeometry(0.22, 0.05, 1.1, 8, 4, true);
    const pos1 = root1Geo.attributes.position;
    for (let i = 0; i < pos1.count; i++) {
      let x = pos1.getX(i);
      let y = pos1.getY(i);
      let z = pos1.getZ(i);

      // Shift
      y -= 0.55;
      const progress = -y / 1.1;

      // Curve
      const rootCenterX = -0.28 + 0.08 * progress;
      x += rootCenterX;

      pos1.setXYZ(i, x, y, z);
    }
    root1Geo.computeVertexNormals();

    // 3. Root 2 Geometry
    const root2Geo = new THREE.CylinderGeometry(0.22, 0.05, 1.1, 8, 4, true);
    const pos2 = root2Geo.attributes.position;
    for (let i = 0; i < pos2.count; i++) {
      let x = pos2.getX(i);
      let y = pos2.getY(i);
      let z = pos2.getZ(i);

      // Shift
      y -= 0.55;
      const progress = -y / 1.1;

      // Curve
      const rootCenterX = 0.28 - 0.08 * progress;
      x += rootCenterX;

      pos2.setXYZ(i, x, y, z);
    }
    root2Geo.computeVertexNormals();

    // Faint glowing wireframe material in gold
    this.refMaterial = new THREE.MeshBasicMaterial({
      color: 0xd4af37, // Luxury Gold
      wireframe: true,
      transparent: true,
      opacity: 0.08,
      depthWrite: false
    });

    const crownMesh = new THREE.Mesh(crownGeo, this.refMaterial);
    const root1Mesh = new THREE.Mesh(root1Geo, this.refMaterial);
    const root2Mesh = new THREE.Mesh(root2Geo, this.refMaterial);

    this.referenceMeshGroup.add(crownMesh);
    this.referenceMeshGroup.add(root1Mesh);
    this.referenceMeshGroup.add(root2Mesh);

    // Apply exact same scale/position coordinates as point cloud
    this.referenceMeshGroup.scale.set(1.8, 1.8, 1.8);
    this.referenceMeshGroup.position.y = 0.3;

    this.scene.add(this.referenceMeshGroup);
  }

  initNerves() {
    this.nervesGroup = new THREE.Group();

    // Define curves for the central root canals and pulp chamber horns
    const leftPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.35, 0),
      new THREE.Vector3(-0.08, 0.15, 0.0),
      new THREE.Vector3(-0.2, -0.3, 0.0),
      new THREE.Vector3(-0.26, -0.9, 0.0)
    ]);

    const rightPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.35, 0),
      new THREE.Vector3(0.08, 0.15, 0.0),
      new THREE.Vector3(0.2, -0.3, 0.0),
      new THREE.Vector3(0.26, -0.9, 0.0)
    ]);

    const leftCuspPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.15, 0),
      new THREE.Vector3(-0.12, 0.35, 0.12),
      new THREE.Vector3(-0.18, 0.65, 0.18)
    ]);

    const rightCuspPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.15, 0),
      new THREE.Vector3(0.12, 0.35, -0.12),
      new THREE.Vector3(0.18, 0.65, -0.18)
    ]);

    // Create solid 3D tubes for a rich anatomical look
    const tubeRadius = 0.022;
    const radialSegments = 6;
    const tubularSegments = 16;

    const leftGeo = new THREE.TubeGeometry(leftPath, tubularSegments, tubeRadius, radialSegments, false);
    const rightGeo = new THREE.TubeGeometry(rightPath, tubularSegments, tubeRadius, radialSegments, false);
    const leftCuspGeo = new THREE.TubeGeometry(leftCuspPath, tubularSegments, tubeRadius - 0.005, radialSegments, false);
    const rightCuspGeo = new THREE.TubeGeometry(rightCuspPath, tubularSegments, tubeRadius - 0.005, radialSegments, false);

    // Rich elegant material: glowing wireframe ruby red
    this.nerveMaterial = new THREE.MeshBasicMaterial({
      color: NERVE_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });

    const leftTube = new THREE.Mesh(leftGeo, this.nerveMaterial);
    const rightTube = new THREE.Mesh(rightGeo, this.nerveMaterial);
    const leftCuspTube = new THREE.Mesh(leftCuspGeo, this.nerveMaterial);
    const rightCuspTube = new THREE.Mesh(rightCuspGeo, this.nerveMaterial);

    this.nervesGroup.add(leftTube);
    this.nervesGroup.add(rightTube);
    this.nervesGroup.add(leftCuspTube);
    this.nervesGroup.add(rightCuspTube);

    // Apply exact same scale and positioning as tooth reference wireframe
    this.nervesGroup.scale.set(1.8, 1.8, 1.8);
    this.nervesGroup.position.y = 0.3;

    this.scene.add(this.nervesGroup);
  }
  
  createCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Radial gradient glow
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }
  
  setupEvents() {
    // Resize listener
    window.addEventListener('resize', () => {
      this.width = this.parent.clientWidth;
      this.height = this.parent.clientHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
    });
    
    // Mouse hover trackers
    const onMouseMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      this.raycaster.setFromCamera(this.mouse, this.camera);
      this.raycaster.ray.intersectPlane(this.interactionPlane, this.mouse3D);
      this.isHovered = true;
    };
    
    const onMouseLeave = () => {
      this.mouse3D.set(999, 999, 999);
      this.isHovered = false;
    };
    
    this.canvas.addEventListener('mousemove', onMouseMove);
    this.canvas.addEventListener('mouseleave', onMouseLeave);
    
    // Touch support for mobiles
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        onMouseMove(e.touches[0]);
      }
    });
    this.canvas.addEventListener('touchend', onMouseLeave);
  }
  
  setMode(mode) {
    this.currentMode = mode;
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      const toothPos = this.targetPositions[i];
      const smilePos = this.smilePositions[i];
      
      if (mode === 'align') {
        // Morph to smile shape
        p.tx = smilePos.x;
        p.ty = smilePos.y;
        p.tz = smilePos.z;
        
        p.tr = ALIGN_COLOR.r;
        p.tg = ALIGN_COLOR.g;
        p.tb = ALIGN_COLOR.b;
      } else {
        // All other modes retain the base tooth model coordinates
        p.tx = toothPos.x;
        p.ty = toothPos.y;
        p.tz = toothPos.z;
        
        if (mode === 'scan') {
          // Triggering neon base blue
          p.tr = SCAN_COLOR.r;
          p.tg = SCAN_COLOR.g;
          p.tb = SCAN_COLOR.b;
        } else if (mode === 'clean') {
          // Base white tooth during cleaning
          p.tr = 1.0;
          p.tg = 1.0;
          p.tb = 1.0;
        } else {
          // Standard/Reset mode
          p.tr = p.baseR;
          p.tg = p.baseG;
          p.tb = p.baseB;
        }
      }
    }
    
    // Scan animation initializer
    if (mode === 'scan') {
      this.scanPlaneY = -2.5;
      this.scanDirection = 1;
    }
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    
    const positions = this.geometry.attributes.position.array;
    const colors = this.geometry.attributes.color.array;
    const time = performance.now() * 0.001;
    
    // 1. Calculate FPS (for metrics reporting)
    this.frames++;
    if (performance.now() > this.lastTime + 1000) {
      this.fps = Math.round((this.frames * 1000) / (performance.now() - this.lastTime));
      this.frames = 0;
      this.lastTime = performance.now();
      
      // Update FPS label in DOM if lab dashboard is active
      const fpsEl = document.getElementById('fps-counter');
      if (fpsEl && this.canvas.id === 'canvas-lab') {
        fpsEl.textContent = this.fps;
      }
    }
    
    // 2. Slow orbital idle rotation
    if (!this.isHovered) {
      this.pointCloud.rotation.y = time * 0.15;
    } else {
      // Gently drag target angle to face mouse
      this.pointCloud.rotation.y += (this.mouse.x * 0.5 - this.pointCloud.rotation.y) * 0.05;
      this.pointCloud.rotation.x += (-this.mouse.y * 0.5 - this.pointCloud.rotation.x) * 0.05;
    }

    // Update holographic reference mesh alignment and shader color states
    if (this.referenceMeshGroup && this.refMaterial) {
      this.referenceMeshGroup.rotation.copy(this.pointCloud.rotation);

      let targetOpacity = 0.08;
      let targetColor = GOLD_COLOR;

      if (this.currentMode === 'align') {
        targetOpacity = 0.0; // Hide wireframe when teeth morph into a smile
      } else if (this.currentMode === 'scan') {
        targetOpacity = 0.15;
        targetColor = SCAN_COLOR;
      } else if (this.currentMode === 'clean') {
        targetOpacity = 0.15;
        targetColor = CLEAN_COLOR;
      }

      this.refMaterial.opacity += (targetOpacity - this.refMaterial.opacity) * 0.08;
      this.refMaterial.color.lerp(targetColor, 0.08);
    }

    // Update internal biological nerve structure alignment and color dynamics
    if (this.nervesGroup && this.nerveMaterial) {
      this.nervesGroup.rotation.copy(this.pointCloud.rotation);

      let targetNerveOpacity = 0.65;
      let targetNerveColor = NERVE_COLOR;

      if (this.currentMode === 'align') {
        targetNerveOpacity = 0.0; // Hide nerves when morphed into smile
      } else if (this.currentMode === 'scan') {
        targetNerveOpacity = 0.9;
        targetNerveColor = new THREE.Color('#ff5500'); // Orange-Red scanning glow
      } else if (this.currentMode === 'clean') {
        targetNerveOpacity = 0.8;
        targetNerveColor = new THREE.Color('#ff0055'); // Glowing magenta
      }

      this.nerveMaterial.opacity += (targetNerveOpacity - this.nerveMaterial.opacity) * 0.08;
      this.nerveMaterial.color.lerp(targetNerveColor, 0.08);
    }
    
    // Apply inverse rotation to mouse3D to align repulsion calculations
    const rotY = -this.pointCloud.rotation.y;
    const rotX = -this.pointCloud.rotation.x;
    
    const localMouse = this.mouse3D.clone();
    localMouse.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    localMouse.applyAxisAngle(new THREE.Vector3(1, 0, 0), rotX);
    
    // 3. Scan line mechanics
    if (this.currentMode === 'scan') {
      this.scanPlaneY += 0.03 * this.scanDirection;
      if (this.scanPlaneY > 2.5) {
        this.scanDirection = -1;
      } else if (this.scanPlaneY < -2.5) {
        this.scanDirection = 1;
      }
    }
    
    // 4. Update individual particle physics
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      
      // A. Target spring attraction
      let fx = (p.tx - p.x) * SPRING_FACTOR;
      let fy = (p.ty - p.y) * SPRING_FACTOR;
      let fz = (p.tz - p.z) * SPRING_FACTOR;
      
      // B. Mouse pointer repulsion
      const dx = p.x - localMouse.x;
      const dy = p.y - localMouse.y;
      const dz = p.z - localMouse.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (distSq < REPULSION_RADIUS * REPULSION_RADIUS) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.001) {
          const repelForce = (1.0 - dist / REPULSION_RADIUS) * REPULSION_STRENGTH;
          fx += (dx / dist) * repelForce;
          fy += (dy / dist) * repelForce;
          fz += (dz / dist) * repelForce;
        }
      }
      
      // C. Brownian noise / wind wobble (Organic float)
      const noiseFreq = 2.0;
      const noiseAmp = 0.015;
      fx += Math.sin(time + p.x * noiseFreq) * noiseAmp;
      fy += Math.cos(time + p.y * noiseFreq) * noiseAmp;
      fz += Math.sin(time + p.z * noiseFreq) * noiseAmp;
      
      // D. Integration
      p.vx = (p.vx + fx) * DAMPING;
      p.vy = (p.vy + fy) * DAMPING;
      p.vz = (p.vz + fz) * DAMPING;
      
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;
      
      // 5. Procedural color modulations based on state
      let targetR = p.tr;
      let targetG = p.tg;
      let targetB = p.tb;
      
      if (this.currentMode === 'scan') {
        // Holographic green laser wave highlights
        const distToScan = Math.abs(p.y - this.scanPlaneY);
        if (distToScan < 0.15) {
          targetR = 0.0;
          targetG = 1.0;
          targetB = 0.8; // Glowing cyan line
          // Laser jitter
          p.x += (Math.random() - 0.5) * 0.05;
          p.z += (Math.random() - 0.5) * 0.05;
        } else if (p.y < this.scanPlaneY) {
          // Scanned area (Bio Green)
          targetR = 0.05;
          targetG = 0.8;
          targetB = 0.4;
        } else {
          // Unscanned area (Dark slate blue)
          targetR = 0.1;
          targetG = 0.2;
          targetB = 0.4;
        }
      } else if (this.currentMode === 'clean') {
        // Sparkle collision flare (Gold sparkle effect on top of white tooth)
        const shineFrequency = 5;
        if (Math.sin(time * shineFrequency + i) > 0.96) {
          targetR = CLEAN_COLOR.r;
          targetG = CLEAN_COLOR.g;
          targetB = CLEAN_COLOR.b;
        }
      }
      
      // Color transition interpolation
      p.r += (targetR - p.r) * 0.1;
      p.g += (targetG - p.g) * 0.1;
      p.b += (targetB - p.b) * 0.1;
      
      // Write back to buffer
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      
      colors[i * 3] = p.r;
      colors[i * 3 + 1] = p.g;
      colors[i * 3 + 2] = p.b;
    }
    
    // Update THREE buffers
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    
    this.renderer.render(this.scene, this.camera);
  }
}

// --------------------------------------------------------------------------
// 4. INTERACTION CONTROLLER & FORM HANDLERS
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // A. Initialize Three instances
  const heroEngine = new ParticleEngine('canvas-3d');
  
  // Inject and run a secondary engine for the Interactive 3D Lab
  const labContainer = document.querySelector('.lab-canvas-container');
  let labEngine = null;
  
  if (labContainer) {
    // Remove the placeholder graphic instructions inside when loading
    const placeholder = labContainer.querySelector('.canvas-placeholder-instructions');
    if (placeholder) placeholder.style.display = 'none';
    
    labEngine = new ParticleEngine('canvas-lab', labContainer);
    // Align lab canvas positioning styles
    const canvasLab = document.getElementById('canvas-lab');
    if (canvasLab) {
      canvasLab.style.width = '100%';
      canvasLab.style.height = '100%';
      canvasLab.style.display = 'block';
    }
  }

  // B. Control panel buttons events for Lab section
  const controlButtons = document.querySelectorAll('.control-btn');
  controlButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle button states
      controlButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const action = btn.getAttribute('data-action');
      if (labEngine) {
        labEngine.setMode(action);
      }
      
      // Modify mock dashboard readout metric
      const accuracyEl = document.getElementById('scan-accuracy');
      if (accuracyEl) {
        if (action === 'scan') {
          accuracyEl.textContent = 'Scanning...';
          setTimeout(() => {
            accuracyEl.textContent = '99.98% (HQ)';
          }, 1500);
        } else if (action === 'clean') {
          accuracyEl.textContent = 'Polish Ready';
        } else if (action === 'align') {
          accuracyEl.textContent = '100% Ideal';
        } else {
          accuracyEl.textContent = '99.8%';
        }
      }
    });
  });

  // C. Header scroll sticky styles
  const header = document.querySelector('.header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    
    // Highlight Active section in navigation
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.nav-link');
    
    let currentId = '';
    sections.forEach(section => {
      const sectionTop = section.offsetTop - 120;
      if (window.scrollY >= sectionTop) {
        currentId = section.getAttribute('id');
      }
    });
    
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${currentId}`) {
        link.classList.add('active');
      }
    });
  });

  // D. Collapsible Hamburger Menu for Mobile
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileLinks = document.querySelectorAll('.mobile-link');
  
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      const icon = menuToggle.querySelector('i');
      if (mobileMenu.classList.contains('open')) {
        icon.setAttribute('data-lucide', 'x');
      } else {
        icon.setAttribute('data-lucide', 'menu');
      }
      lucide.createIcons(); // rebuild icons
    });
    
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        const icon = menuToggle.querySelector('i');
        icon.setAttribute('data-lucide', 'menu');
        lucide.createIcons();
      });
    });
  }

  // E. Form submission handling (Dr. Pooja / charanmandela5@gmail.com)
  const bookingForm = document.getElementById('booking-form');
  const successOverlay = document.getElementById('success-overlay');
  const successCloseBtn = document.getElementById('success-close-btn');
  
  if (bookingForm && successOverlay) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Grab booking metadata fields
      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
      const phone = document.getElementById('phone').value;
      const date = document.getElementById('date').value;
      const service = document.getElementById('service').value;
      const notes = document.getElementById('notes').value;
      
      console.log('--- APPOINTMENT BOOKING REQUEST ---');
      console.log('Sending message to: charanmandela5@gmail.com');
      console.log('Patient Name:', name);
      console.log('Patient Email:', email);
      console.log('Phone:', phone);
      console.log('Date Requested:', date);
      console.log('Service Selected:', service);
      console.log('Notes:', notes);
      console.log('-----------------------------------');
      
      // Activate glowing checkmark overlay modal
      successOverlay.classList.add('active');
    });
  }
  
  if (successCloseBtn && successOverlay && bookingForm) {
    successCloseBtn.addEventListener('click', () => {
      successOverlay.classList.remove('active');
      bookingForm.reset();
    });
  }
});
