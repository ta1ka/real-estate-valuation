/**
 * lenis-init.js
 * Initializes Lenis smooth scroll and integrates with GSAP ScrollTrigger.
 * Loaded as a regular script (not module) after Lenis and GSAP CDN tags.
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover)').matches) return;

  var lenis = new Lenis({
    lerp: 0.14,
    duration: 0.75,
    smoothWheel: true,
    wheelMultiplier: 1.15
  });

  lenis.on('scroll', function () {
    ScrollTrigger.update();
  });

  gsap.ticker.add(function (time) {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(500, 33);

  document.addEventListener('focusin', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      lenis.stop();
    }
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      lenis.start();
    }
  });

  window.__lenis = lenis;
})();
