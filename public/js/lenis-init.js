/**
 * lenis-init.js
 * Initializes Lenis smooth scroll and integrates with GSAP ScrollTrigger.
 * Loaded as a regular script (not module) after Lenis and GSAP CDN tags.
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasHover = window.matchMedia('(hover: hover)').matches;
  var deviceMemory = Number(navigator.deviceMemory || 0);
  var hardwareConcurrency = Number(navigator.hardwareConcurrency || 0);
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var devicePixelRatioValue = Number(window.devicePixelRatio || 1);
  var viewportWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  var liteMode =
    saveData ||
    devicePixelRatioValue >= 1.5 ||
    (deviceMemory && deviceMemory <= 12) ||
    (hardwareConcurrency && hardwareConcurrency <= 12) ||
    (hasHover && viewportWidth < 1440);

  if (prefersReducedMotion) {
    window.__motionProfile = 'reduced';
    document.documentElement.classList.add('motion-reduced');
    return;
  }

  if (liteMode) {
    window.__motionProfile = 'lite';
    document.documentElement.classList.add('motion-lite');
  } else {
    window.__motionProfile = 'full';
  }

  if (!hasHover || liteMode) return;

  var lenis = new Lenis({
    lerp: 0.085,
    duration: 0.5,
    smoothWheel: true,
    wheelMultiplier: 0.96
  });

  var scrollTicking = false;
  lenis.on('scroll', function () {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(function () {
      ScrollTrigger.update();
      scrollTicking = false;
    });
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
