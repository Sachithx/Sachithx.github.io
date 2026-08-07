(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  const header = document.querySelector(".site-header");
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    reveals.forEach((el) => observer.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  const paths = [
    document.querySelector(".wave-a"),
    document.querySelector(".wave-b"),
    document.querySelector(".wave-c"),
  ].filter(Boolean);

  if (!paths.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const width = 1200;
  const height = 600;

  const makePath = (phase, amp, freq, yBase, noise) => {
    const steps = 72;
    let d = "";
    for (let i = 0; i <= steps; i += 1) {
      const x = (i / steps) * width;
      const t = (i / steps) * Math.PI * 2 * freq + phase;
      const y =
        yBase +
        Math.sin(t) * amp +
        Math.sin(t * 2.3 + phase * 0.7) * (amp * 0.28) +
        Math.cos(t * 0.5 + noise) * noise;
      d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
    }
    return d.trim();
  };

  const configs = [
    { amp: 48, freq: 1.6, y: 210, noise: 10, speed: 0.55 },
    { amp: 68, freq: 1.15, y: 300, noise: 16, speed: 0.35 },
    { amp: 36, freq: 2.1, y: 390, noise: 8, speed: 0.7 },
  ];

  let phase = 0;
  let frame = 0;

  const draw = (time) => {
    phase = time * 0.001;
    paths.forEach((path, i) => {
      const c = configs[i];
      path.setAttribute(
        "d",
        makePath(phase * c.speed + i, c.amp, c.freq, c.y, c.noise)
      );
    });
    if (!reduceMotion) {
      frame = requestAnimationFrame(draw);
    }
  };

  if (reduceMotion) {
    draw(0);
  } else {
    frame = requestAnimationFrame(draw);
  }

  window.addEventListener("beforeunload", () => cancelAnimationFrame(frame));
})();
