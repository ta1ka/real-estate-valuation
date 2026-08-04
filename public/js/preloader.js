/**
 * preloader.js
 * Brand preloader that covers asset loading.
 * Tracks loading progress of GLB models and shader compilation.
 * Wipes upward to reveal hero when complete.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

var MODELS = ['mansion', 'land', 'building'];
var MODEL_PATH = '/models/';

var dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://unpkg.com/three@0.168.0/examples/jsm/libs/draco/');
var gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

window.__loadedModels = {};

function loadModels(onProgress) {
  var loaded = 0;
  var total = MODELS.length;

  return Promise.all(MODELS.map(function (name) {
    return new Promise(function (resolve) {
      gltfLoader.load(
        MODEL_PATH + name + '.glb',
        function (gltf) {
          window.__loadedModels[name] = gltf.scene;
          loaded++;
          onProgress(loaded / total);
          resolve();
        },
        undefined,
        function (err) {
          console.warn('preloader: failed to load ' + name, err);
          loaded++;
          onProgress(loaded / total);
          resolve();
        }
      );
    });
  }));
}

function loadShaders() {
  return Promise.all([
    fetch('/shaders/fog.vert').then(function (r) { return r.text(); }),
    fetch('/shaders/fog.frag').then(function (r) { return r.text(); })
  ]).then(function (results) {
    window.__fogShaders = { vert: results[0], frag: results[1] };
  });
}

function animatePreloader() {
  var overlay = document.getElementById('preloader');
  var progressBar = document.getElementById('preloader-progress');
  var skipReady = false;

  setTimeout(function () { skipReady = true; }, 1000);

  function updateProgress(ratio) {
    if (progressBar) {
      progressBar.style.width = (ratio * 100) + '%';
    }
  }

  function dismiss() {
    if (!overlay) return;
    gsap.to(overlay, {
      yPercent: -100,
      duration: 0.8,
      ease: 'power3.inOut',
      onComplete: function () {
        overlay.remove();
        if (window.__startHeroEntrance) {
          window.__startHeroEntrance();
        }
        if (window.__initPropertyScenes) {
          window.__initPropertyScenes();
        }
        if (window.__initMicroInteractions) {
          window.__initMicroInteractions();
        }
        if (window.__initFormInteractions) {
          window.__initFormInteractions();
        }
      }
    });
  }

  document.addEventListener('click', function skipHandler() {
    if (skipReady) {
      document.removeEventListener('click', skipHandler);
      dismiss();
    }
  });

  var modelPromise = loadModels(updateProgress);
  var shaderPromise = loadShaders();

  Promise.all([modelPromise, shaderPromise]).then(function () {
    updateProgress(1);
    setTimeout(dismiss, 300);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', animatePreloader);
} else {
  animatePreloader();
}

export { gltfLoader, dracoLoader };
