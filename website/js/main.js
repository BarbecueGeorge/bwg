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
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var success = document.getElementById("form-success");
      var errBox = document.getElementById("form-error");
      var submitBtn = document.getElementById("contact-submit");
      var endpoint = "https://formsubmit.co/ajax/hello@builtwithgrok.co.uk";

      if (errBox) {
        errBox.hidden = true;
        errBox.textContent = "";
      }
      if (success) {
        success.hidden = true;
        success.classList.remove("show");
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var data = {
        name: (form.elements.namedItem("name") || {}).value || "",
        email: (form.elements.namedItem("email") || {}).value || "",
        company: (form.elements.namedItem("company") || {}).value || "",
        interest: (form.elements.namedItem("interest") || {}).value || "",
        message: (form.elements.namedItem("message") || {}).value || "",
        _subject: "Built With Grok — project enquiry",
        _template: "table",
        _captcha: "false",
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }

      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(data),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          var body = result.body || {};
          if (result.ok && (body.success === "true" || body.success === true || body.message)) {
            if (success) {
              success.hidden = false;
              success.classList.add("show");
              success.focus && success.focus();
            }
            form.reset();
            return;
          }
          throw new Error(
            (body && (body.message || body.error)) ||
              "Could not send your message. Email hello@builtwithgrok.co.uk directly."
          );
        })
        .catch(function (err) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent =
              (err && err.message) ||
              "Could not send your message. Please email hello@builtwithgrok.co.uk.";
          }
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Send message";
          }
        });
    });
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
