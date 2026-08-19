(function () {
  const ANIMATION = "SPACE X WEB";
  const END_TIME = 1.6;
  const PLAY_DELAY_MS = 1500;
  const LOAD_TIMEOUT_MS = 4000;
  const RIV_SRC = "assets/rive/space-x-web-logo-dark.riv";
  const WASM_URL = "assets/rive/rive.wasm";

  function easeProgress(time) {
    const x = (time - 0.55) / 0.55;
    if (x <= 0) {
      return 0;
    }
    if (x >= 1) {
      return 1;
    }
    return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
  }

  function scaleForTime(time) {
    return 0.9 + 0.1 * easeProgress(time);
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  const shell = document.querySelector(".spacexai-logo-shell");
  const track = document.querySelector(".tagline-spacexai-inner");
  const canvas = document.querySelector(".spacexai-logo-canvas");
  const canvasWrap = document.querySelector(".spacexai-logo-canvas-wrap");
  const wordmarkFallback = document.querySelector(
    ".spacexai-logo-fallback--wordmark",
  );
  const markFallback = document.querySelector(".spacexai-logo-fallback--mark");

  if (!shell || !canvas) {
    return;
  }

  function resetStraplineTransform() {
    if (track) {
      track.style.transform = "";
    }
  }

  function showWordmarkFallback() {
    shell.classList.add("spacexai-logo-shell--fallback-wordmark");
    shell.style.transform = "scale(1)";
    if (wordmarkFallback) {
      wordmarkFallback.hidden = false;
    }
    resetStraplineTransform();
  }

  function showMarkFallback() {
    shell.classList.add(
      "spacexai-logo-shell--fallback-mark",
      "spacexai-logo-shell--finished",
    );
    shell.style.transform = "scale(1)";
    if (markFallback) {
      markFallback.hidden = false;
    }
    resetStraplineTransform();
  }

  function applyScale(time) {
    shell.style.transform = `scale(${scaleForTime(time)})`;
  }

  function finishPlayback(instance) {
    instance.pause();
    instance.scrub(ANIMATION, END_TIME);
    shell.classList.add("spacexai-logo-shell--finished");
    shell.style.transform = "scale(1)";
    if (markFallback) {
      markFallback.hidden = false;
    }
    canvasWrap?.classList.remove("spacexai-logo-canvas-wrap--visible");
    resetStraplineTransform();
  }

  function bindAuthReset() {
    if (window.EveFamilyAuth?.onSessionChange) {
      window.EveFamilyAuth.onSessionChange(resetStraplineTransform);
      return;
    }
    window.setTimeout(bindAuthReset, 0);
  }

  bindAuthReset();

  if (prefersReducedMotion()) {
    showWordmarkFallback();
    return;
  }

  if (typeof rive === "undefined" || typeof rive.Rive !== "function") {
    showWordmarkFallback();
    return;
  }

  rive.RuntimeLoader.setWasmUrl(WASM_URL);

  let riveInstance = null;
  let loadFailed = false;
  let loadSettled = false;

  function bindDpiResize(instance) {
    let mediaQuery = null;
    const resize = () => {
      instance.resizeDrawingSurfaceToCanvas();
      watchDpi();
    };
    function watchDpi() {
      mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mediaQuery.addEventListener("change", resize, { once: true });
    }
    watchDpi();
    return () => mediaQuery?.removeEventListener("change", resize);
  }

  function startIntro(instance) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        canvasWrap?.classList.add("spacexai-logo-canvas-wrap--visible");
        shell.classList.add("spacexai-logo-shell--visible");
      });
    });

    instance.resizeDrawingSurfaceToCanvas();
    instance.scrub(ANIMATION, 0);
    applyScale(0);

    let elapsed = 0;
    let finished = false;
    let unbindDpi = bindDpiResize(instance);

    function complete() {
      if (finished) {
        return;
      }
      finished = true;
      instance.off(rive.EventType.Advance, onAdvance);
      instance.off(rive.EventType.Loop, onLoop);
      finishPlayback(instance);
      unbindDpi?.();
    }

    function onAdvance(event) {
      if (finished) {
        return;
      }
      elapsed += event?.data ?? 0;
      applyScale(elapsed);
      if (elapsed >= END_TIME) {
        complete();
      }
    }

    function onLoop() {
      complete();
    }

    instance.on(rive.EventType.Advance, onAdvance);
    instance.on(rive.EventType.Loop, onLoop);

    window.setTimeout(() => {
      if (!finished) {
        instance.play(ANIMATION);
      }
    }, PLAY_DELAY_MS);
  }

  riveInstance = new rive.Rive({
    src: RIV_SRC,
    canvas,
    autoplay: false,
    animations: ANIMATION,
    layout: new rive.Layout({
      fit: rive.Fit.Contain,
      alignment: rive.Alignment.Center,
    }),
    onLoad: () => {
      loadSettled = true;
      if (loadFailed) {
        return;
      }
      startIntro(riveInstance);
    },
    onLoadError: (error) => {
      loadSettled = true;
      loadFailed = true;
      console.warn("SpaceXAI logo animation failed to load.", error);
      showMarkFallback();
    },
  });

  window.setTimeout(() => {
    if (!loadSettled) {
      loadFailed = true;
      showMarkFallback();
    }
  }, LOAD_TIMEOUT_MS);
})();