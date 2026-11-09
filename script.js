(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Footer year
  document.querySelectorAll("#year").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  // Header border once the page scrolls
  const header = document.querySelector(".site-header");
  const onScroll = () => {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Count-up numbers: <span data-count="97.91" data-decimals="2" data-suffix="%">
  const countUp = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    const format = (v) => prefix + v.toFixed(decimals) + suffix;
    if (reduceMotion || Number.isNaN(target)) {
      el.textContent = format(target);
      return;
    }
    const duration = 1300;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Guarantee the exact final value even if animation frames are throttled.
    setTimeout(() => {
      el.textContent = format(target);
    }, duration + 150);
  };

  // Reveal-on-scroll for sections, charts (bars grow), and counters
  const watched = document.querySelectorAll(".reveal, .chart, [data-count]");
  const show = (el) => {
    el.classList.add("is-visible");
    if (el.dataset.count !== undefined) countUp(el);
  };
  if ("IntersectionObserver" in window && !reduceMotion) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          show(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -6% 0px" }
    );
    watched.forEach((el) => observer.observe(el));
  } else {
    watched.forEach(show);
  }

  // BibTeX toggles on the publication list
  document.querySelectorAll("[data-bib-toggle]").forEach((btn) => {
    const target = document.getElementById(btn.dataset.bibToggle);
    if (!target) return;
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => {
      const open = target.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(open));
    });
  });

  // Copy buttons inside code blocks
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const block = btn.closest(".code-block");
      const code = block ? block.querySelector("code") : null;
      if (!code) return;
      const text = code.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      const label = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = label;
      }, 1600);
    });
  });
})();
