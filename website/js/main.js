(function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  var form = document.getElementById("contact-form");
  if (form) {
    var success = document.getElementById("form-success");
    var errBox = document.getElementById("form-error");
    var params = window.location.search || "";
    if (success && /[?&]sent=1(?:&|$)/.test(params)) {
      success.hidden = false;
      success.classList.add("show");
      if (success.focus) success.focus();
    }
    if (errBox && /[?&]error=1(?:&|$)/.test(params)) {
      errBox.hidden = false;
    }
    // Native POST to /api/contact. Do not fetch() FormSubmit from the browser.
  }

  // Hero video header: ensure autoplay, allow click to pause/play
  document.querySelectorAll(".hero-video").forEach(function (video) {
    var tryPlay = function () {
      var p = video.play();
      if (p && typeof p.catch === "function") {
        p.catch(function () {});
      }
    };
    tryPlay();
    video.addEventListener("click", function () {
      if (video.paused) {
        tryPlay();
      } else {
        video.pause();
      }
    });
  });
})();
