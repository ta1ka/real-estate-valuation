/**
 * micro-interactions.js
 * Morphing buttons (expand + gold wash + magnetic pull),
 * hover-lift cards (translateY + glow + 3D tilt).
 * Runs after DOM is ready. Uses GSAP for animations.
 */
(function () {
  'use strict';

  var isTouch = !window.matchMedia('(hover: hover)').matches;

  function initMagneticButtons() {
    if (isTouch) return;

    document.querySelectorAll('.cta-button, .type-scene-cta').forEach(function (btn) {
      var RADIUS = 80;
      var MAX_SHIFT = 8;

      btn.addEventListener('mousemove', function (e) {
        var rect = btn.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = e.clientX - cx;
        var dy = e.clientY - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < RADIUS) {
          var strength = 1 - (dist / RADIUS);
          gsap.to(btn, {
            x: dx * strength * (MAX_SHIFT / RADIUS),
            y: dy * strength * (MAX_SHIFT / RADIUS),
            duration: 0.3,
            ease: 'power2.out'
          });
        }
      });

      btn.addEventListener('mouseleave', function () {
        gsap.to(btn, { x: 0, y: 0, duration: 0.3, ease: 'power2.out' });
      });

      btn.addEventListener('mousedown', function () {
        gsap.to(btn, { scale: 0.95, duration: 0.1 });
      });
      btn.addEventListener('mouseup', function () {
        gsap.to(btn, { scale: 1, duration: 0.2, ease: 'back.out(1.7)' });
      });
    });
  }

  function initHoverLift() {
    if (isTouch) return;

    document.querySelectorAll('[data-hover-lift]').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;

        gsap.to(card, {
          y: -8,
          rotateX: -y * 6,
          rotateY: x * 6,
          boxShadow: '0 8px 24px rgba(185, 147, 90, 0.12)',
          duration: 0.25,
          ease: 'power2.out'
        });
      });

      card.addEventListener('mouseleave', function () {
        gsap.to(card, {
          y: 0,
          rotateX: 0,
          rotateY: 0,
          boxShadow: '0 0 0 rgba(185, 147, 90, 0)',
          duration: 0.4,
          ease: 'power2.out'
        });
      });
    });
  }

  function initSplitTextReveals() {
    document.querySelectorAll('[data-split-reveal]').forEach(function (el) {
      var split = new SplitText(el, { type: 'chars' });

      gsap.from(split.chars, {
        y: 20,
        opacity: 0,
        stagger: 0.02,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 80%',
          once: true
        }
      });
    });
  }

  function init() {
    initMagneticButtons();
    initHoverLift();
    initSplitTextReveals();
  }

  window.__initMicroInteractions = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
