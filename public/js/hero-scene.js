/**
 * hero-scene.js
 * Hero viewport scene: WebGL fog shader background, particle system,
 * ghost mansion wireframe-to-solid construction, parallax scroll-out.
 */
import * as THREE from 'three';

(function () {
  'use strict';

  var PARTICLE_COUNT = 18;
  var MANSION_OPACITY = 0.22;
  var ROTATION_SPEED = 0.12;
  var MAX_FPS = 30;
  var heroStarted = false;

  var container = document.getElementById('hero-scene');
  if (!container) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  container.appendChild(canvas);

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.3, 2.5);
  camera.lookAt(0, 0, 0);

  var scene = new THREE.Scene();

  var fogUniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) }
  };

  function setupFogBackground() {
    var shaders = window.__fogShaders;
    if (!shaders) return;

    var fogMaterial = new THREE.ShaderMaterial({
      vertexShader: shaders.vert,
      fragmentShader: shaders.frag,
      uniforms: fogUniforms,
      depthWrite: false
    });

    var fogMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fogMaterial);
    fogMesh.renderOrder = -1;
    fogMesh.frustumCulled = false;

    var fogScene = new THREE.Scene();
    var fogCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    fogScene.add(fogMesh);

    window.__fogRender = { scene: fogScene, camera: fogCamera };
  }

  var particleGroup = new THREE.Group();
  scene.add(particleGroup);

  function createParticles() {
    var geometry = new THREE.BufferGeometry();
    var positions = new Float32Array(PARTICLE_COUNT * 3);
    var colors = new Float32Array(PARTICLE_COUNT * 3);

    var gold = new THREE.Color(0xb9935a);
    var white = new THREE.Color(0xffffff);

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2;

      var c = Math.random() > 0.4 ? gold : white;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var material = new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    particleGroup.add(new THREE.Points(geometry, material));
  }

  createParticles();

  var mansionGroup = new THREE.Group();
  scene.add(mansionGroup);

  scene.add(new THREE.AmbientLight(0xf6e7c8, 0.4));
  var dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  function setupMansion() {
    var model = window.__loadedModels && window.__loadedModels.mansion;
    if (!model) {
      var blockMaterial = new THREE.MeshPhongMaterial({
        color: 0xb9935a,
        transparent: true,
        opacity: MANSION_OPACITY
      });
      var wireMaterial = new THREE.MeshBasicMaterial({
        color: 0xf6e7c8,
        wireframe: true,
        transparent: true,
        opacity: 0.22
      });

      var base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.18, 0.7), blockMaterial);
      var mid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.26, 0.56), blockMaterial.clone());
      var top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.42), blockMaterial.clone());
      var wire = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.7, 0.74), wireMaterial);

      base.position.y = -0.32;
      mid.position.y = -0.02;
      top.position.y = 0.26;
      wire.position.y = -0.05;

      mansionGroup.add(base, mid, top, wire);
      window.__heroMansion = { group: mansionGroup, meshes: [] };
      return;
    }

    var mansion = model.clone();

    var box = new THREE.Box3().setFromObject(mansion);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    mansion.position.sub(center);
    var maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) mansion.scale.multiplyScalar(1 / maxDim);

    mansion.position.y -= 0.15;

    var meshes = [];
    mansion.traverse(function (child) {
      if (child.isMesh && child.material) {
        var mat = child.material.clone();
        mat.transparent = true;
        mat.opacity = 0;
        child.material = mat;

        var wireMat = new THREE.MeshBasicMaterial({
          color: 0xb9935a,
          wireframe: true,
          transparent: true,
          opacity: 0
        });
        var wireChild = new THREE.Mesh(child.geometry, wireMat);
        wireChild.position.copy(child.position);
        wireChild.rotation.copy(child.rotation);
        wireChild.scale.copy(child.scale);
        mansion.add(wireChild);

        meshes.push({ solid: child, wire: wireChild, wireMat: wireMat, solidMat: mat });
      }
    });

    mansionGroup.add(mansion);
    window.__heroMansion = { group: mansion, meshes: meshes };
  }

  window.__startHeroEntrance = function () {
    if (heroStarted) return;
    heroStarted = true;

    setupFogBackground();
    setupMansion();

    var mansion = window.__heroMansion;
    if (mansion) {
      mansion.meshes.forEach(function (m) {
        gsap.to(m.wireMat, { opacity: 0.36, duration: 0.6, delay: 0.2 });
      });

      mansion.meshes.forEach(function (m) {
        gsap.to(m.solidMat, { opacity: MANSION_OPACITY, duration: 0.65, delay: 0.55 });
        gsap.to(m.wireMat, { opacity: 0, duration: 0.45, delay: 0.9 });
      });
    }

    var heroTitle = document.querySelector('.hero-title');
    if (heroTitle && typeof SplitText !== 'undefined') {
      var split = new SplitText(heroTitle, { type: 'chars' });
      gsap.from(split.chars, {
        y: 20,
        opacity: 0,
        stagger: 0.02,
        duration: 0.6,
        ease: 'power2.out',
        delay: 1.2
      });
    }

    gsap.from('.hero-eyebrow', { opacity: 0, y: 10, duration: 0.5, delay: 0.8 });
    gsap.from('.hero-subtitle', { opacity: 0, y: 10, duration: 0.5, delay: 1.6 });
    gsap.from('.hero-cta', { opacity: 0, y: 10, duration: 0.5, delay: 1.8 });
    gsap.from('.hero-nav', { opacity: 0, duration: 0.5, delay: 1.8 });
    gsap.from('.hero-scroll-cue', { opacity: 0, duration: 0.5, delay: 2.2 });

    setupScrollOut();
  };

  function setupScrollOut() {
    var heroSection = document.getElementById('hero');
    if (!heroSection) return;

    gsap.timeline({
      scrollTrigger: {
        trigger: heroSection,
        start: 'top top',
        end: '+=35%',
        scrub: 0.6,
        pin: false
      }
    })
    .to('.hero-title, .hero-subtitle, .hero-cta, .hero-eyebrow', {
      y: -80,
      opacity: 0,
      stagger: 0.05
    }, 0)
    .to(particleGroup.position, { y: 0.5 }, 0)
    .to(particleGroup, { visible: false }, 0.7)
    .to(mansionGroup.position, { y: -0.3 }, 0)
    .to(mansionGroup, { visible: false }, 0.8)
    .to(container, { opacity: 0 }, 0.5);
  }

  function resize() {
    var w = container.clientWidth;
    var h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fogUniforms.uResolution.value.set(w, h);
  }

  window.addEventListener('resize', resize);
  resize();

  var clock = new THREE.Clock();
  var lastFrameTime = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    if (now && now - lastFrameTime < 1000 / MAX_FPS) return;
    lastFrameTime = now || 0;

    // Fix A: Skip rendering when hero is offscreen
    var rect = container.getBoundingClientRect();
    if (rect.bottom < -50 || rect.top > window.innerHeight + 50) return;

    var delta = clock.getDelta();
    fogUniforms.uTime.value += delta;

    var positions = particleGroup.children[0] && particleGroup.children[0].geometry.attributes.position;
    if (positions) {
      for (var i = 0; i < positions.count; i++) {
        positions.array[i * 3 + 1] += delta * 0.05;
        if (positions.array[i * 3 + 1] > 1.5) {
          positions.array[i * 3 + 1] = -1.5;
        }
      }
      positions.needsUpdate = true;
    }

    if (window.__heroMansion) {
      window.__heroMansion.group.rotation.y += ROTATION_SPEED * delta;
    }

    if (window.__fogRender) {
      renderer.autoClear = true;
      renderer.render(window.__fogRender.scene, window.__fogRender.camera);
      renderer.autoClear = false;
    }

    renderer.render(scene, camera);
  }

  tick();

  function bootHeroScene() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.gsap || !window.ScrollTrigger) return;
    window.__startHeroEntrance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootHeroScene, { once: true });
  } else {
    setTimeout(bootHeroScene, 0);
  }
})();
