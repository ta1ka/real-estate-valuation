/**
 * property-scenes.js
 * Layered parallax property scenes with scroll-driven depth animations.
 * Pure CSS/GSAP — no WebGL overhead.
 */
(function () {
  'use strict';

  var MOUSE_TILT_MAX = 8;
  var MOUSE_LERP = 0.06;
  var isTouch = !window.matchMedia('(hover: hover)').matches;
  var mouse = { x: 0, y: 0 };
  var scenes = [];

  if (!isTouch) {
    document.addEventListener('mousemove', function (e) {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
  }

  var SCENE_CONFIG = [
    { containerId: 'scene-mansion' },
    { containerId: 'scene-land' },
    { containerId: 'scene-building' }
  ];

  function initScene(config) {
    var container = document.getElementById(config.containerId);
    if (!container) return;

    var bg = container.querySelector('[data-parallax="bg"]');
    var mid = container.querySelector('[data-parallax="mid"]');
    var fg = container.querySelector('[data-parallax="fg"]');

    if (!bg || !mid) return;

    var entry = {
      container: container,
      bg: bg,
      mid: mid,
      fg: fg,
      currentRotX: 0,
      currentRotY: 0
    };

    // Scroll-driven parallax timeline
    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: container,
        start: 'top top',
        end: '+=200%',
        scrub: 0.5,
        pin: true
      }
    });

    // Phase 1: Image entrance with scale + parallax depth
    tl.fromTo(mid, {
      scale: 1.15,
      y: 80,
      opacity: 0,
      rotateY: -6
    }, {
      scale: 1,
      y: 0,
      opacity: 1,
      rotateY: 0,
      duration: 0.4,
      ease: 'power2.out'
    }, 0);

    // Background moves slower (depth)
    tl.fromTo(bg, {
      scale: 1.3,
      y: 60
    }, {
      scale: 1.1,
      y: -40,
      duration: 1,
      ease: 'none'
    }, 0);

    // Foreground gradient shifts
    if (fg) {
      tl.fromTo(fg, {
        opacity: 0.3,
        y: 20
      }, {
        opacity: 1,
        y: -10,
        duration: 1,
        ease: 'none'
      }, 0);
    }

    // Phase 2: Text reveals
    var textEls = container.querySelectorAll('[data-scene-reveal]');
    textEls.forEach(function (el) {
      var delay = parseFloat(el.dataset.sceneReveal) || 0.3;
      tl.from(el, {
        opacity: 0,
        y: 30,
        duration: 0.15,
        ease: 'power2.out'
      }, 0.25 + delay * 0.3);
    });

    // Phase 3: Fade out
    tl.to(container, { opacity: 0, duration: 0.15 }, 0.85);

    scenes.push(entry);
  }

  // Mouse-follow tilt on property images (3D feel)
  function tickTilt() {
    if (isTouch) return;
    requestAnimationFrame(tickTilt);

    scenes.forEach(function (entry) {
      var rect = entry.container.getBoundingClientRect();
      if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;

      var targetRotX = mouse.y * MOUSE_TILT_MAX;
      var targetRotY = mouse.x * MOUSE_TILT_MAX;
      entry.currentRotX += (targetRotX - entry.currentRotX) * MOUSE_LERP;
      entry.currentRotY += (targetRotY - entry.currentRotY) * MOUSE_LERP;

      entry.mid.style.transform =
        'translate(0, -50%) perspective(800px) rotateX(' +
        entry.currentRotX * 0.3 + 'deg) rotateY(' +
        entry.currentRotY * 0.5 + 'deg)';
    });
  }

  /* ── CTA click handler ── */
  document.addEventListener('click', function (e) {
    var cta = e.target.closest('.type-scene-cta');
    if (!cta) return;

    var type = cta.dataset.propertyType;
    if (!type) return;

    window.__selectedPropertyType = type;

    gsap.fromTo(cta, { borderColor: 'rgba(185,147,90,1)' }, {
      borderColor: 'rgba(185,147,90,0.35)',
      duration: 0.6,
      ease: 'power2.out'
    });

    var formSection = document.getElementById('valuation-form');
    if (formSection && window.__lenis) {
      window.__lenis.scrollTo(formSection, { duration: 1.5 });
    }
  });

  window.__initPropertyScenes = function () {
    SCENE_CONFIG.forEach(initScene);
    tickTilt();
  };
})();
