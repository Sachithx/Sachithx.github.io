/*
 * Interactive illustrations for the ConceptTime and EntroPE project pages.
 * Both run on small synthetic signals; they illustrate the mechanism of each
 * paper and are not reproductions of the reported experiments.
 */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- small helpers ----------
  const el = (tag, attrs = {}, parent) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  };
  const clear = (node) => {
    while (node.firstChild) node.removeChild(node.firstChild);
  };
  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const variance = (a) => {
    const m = mean(a);
    return mean(a.map((v) => (v - m) ** 2));
  };
  const std = (a) => Math.sqrt(variance(a));
  const quantile = (a, q) => {
    const s = [...a].sort((x, y) => x - y);
    const i = (s.length - 1) * q;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const path = (xs, ys) =>
    xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join("");
  const tween = (ms, fn, done) => {
    if (reduceMotion || ms <= 0) {
      fn(1);
      if (done) done();
      return () => {};
    }
    let stopped = false;
    const t0 = performance.now();
    const step = (now) => {
      if (stopped) return;
      const t = Math.min(1, (now - t0) / ms);
      fn(1 - Math.pow(1 - t, 3));
      if (t < 1) requestAnimationFrame(step);
      else if (done) done();
    };
    requestAnimationFrame(step);
    return () => {
      stopped = true;
    };
  };
  const onFirstView = (node, fn) => {
    if (!("IntersectionObserver" in window)) {
      fn();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          fn();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(node);
  };
  // One-step-ahead damped-trend predictor shared by both toy "forecasters".
  const predict = (x, t) => (t < 2 ? x[0] : x[t - 1] + 0.55 * (x[t - 1] - x[t - 2]));

  const COLORS = {
    ink: "#18232d",
    muted: "#687681",
    grid: "#e2e6e8",
    accent: "#0f6b5c",
    surprise: "#b5641c",
    rust: "#b4442a",
    concept: ["#1f8a70", "#e3a33b", "#8457c2"],
  };

  // =====================================================================
  // ConceptTime: predictive surprise -> segments -> concepts -> fidelity
  // =====================================================================
  const ct = document.getElementById("ct-demo");
  if (ct) initConceptTime(ct);

  function initConceptTime(root) {
    const T = 200;
    const K = 8;
    const LMIN = 12;
    const LMAX = 44;

    const makeSignal = (unfamiliar) => {
      const r = rng(11);
      const noise = Array.from({ length: T }, () => 0.035 * gauss(r));
      const r2 = rng(5);
      const x = [];
      for (let t = 0; t < T; t += 1) {
        const calm = 0.32 * Math.sin((2 * Math.PI * t) / 16);
        let v;
        if (t < 100) v = calm + 1.9 * Math.exp(-((t - 50) ** 2) / 3.5);
        else if (t < 140) v = 0.95 + 0.22 * Math.sin((2 * Math.PI * t) / 7);
        else if (t < 172) v = 0.95 - (1.05 * (t - 140)) / 32 + 0.06 * Math.sin(t / 2);
        else v = -0.1 + calm;
        v += noise[t];
        if (unfamiliar && t >= 64 && t < 94) v += 0.5 * gauss(r2);
        x.push(v);
      }
      return x;
    };

    const analyse = (x) => {
      const mu = [];
      const s2 = [];
      const s = [];
      const z2 = [];
      let v = 0.01;
      for (let t = 0; t < T; t += 1) {
        mu[t] = predict(x, t);
        s2[t] = v + 0.002;
        const res = x[t] - mu[t];
        z2[t] = (res * res) / s2[t];
        s[t] = 0.5 * (Math.log(s2[t]) + z2[t]);
        v = 0.8 * v + 0.2 * res * res;
      }
      s[0] = s[1] = s[2];
      z2[0] = z2[1] = z2[2];
      return { mu, s2, s, z2 };
    };

    // Length-constrained DP: K segments, maximise total surprise at boundaries.
    const segment = (score) => {
      const NEG = -1e18;
      const B = Array.from({ length: K }, () => new Float64Array(T + 1).fill(NEG));
      const P = Array.from({ length: K }, () => new Int32Array(T + 1).fill(-1));
      B[0][0] = 0;
      for (let k = 1; k < K; k += 1) {
        for (let t = k * LMIN; t <= T - LMIN; t += 1) {
          for (let L = LMIN; L <= LMAX && t - L >= 0; L += 1) {
            const prev = B[k - 1][t - L];
            if (prev <= NEG / 2) continue;
            const val = prev + score[t];
            if (val > B[k][t]) {
              B[k][t] = val;
              P[k][t] = t - L;
            }
          }
        }
      }
      let best = NEG;
      let bt = -1;
      for (let t = 0; t <= T; t += 1) {
        const L = T - t;
        if (L >= LMIN && L <= LMAX && B[K - 1][t] > best) {
          best = B[K - 1][t];
          bt = t;
        }
      }
      const cuts = [];
      for (let k = K - 1, t = bt; k >= 1; k -= 1) {
        cuts.push(t);
        t = P[k][t];
      }
      return [0, ...cuts.reverse(), T];
    };

    const signatures = (bounds, a) => {
      const out = [];
      for (let j = 0; j < bounds.length - 1; j += 1) {
        // Predictive geometry, as in the paper's Figure 1: how uncertain the
        // forecaster was (mean log-variance) and how surprised it was (mean NLL).
        const segS = a.s.slice(bounds[j], bounds[j + 1]);
        const segV = a.s2.slice(bounds[j], bounds[j + 1]).map(Math.log);
        out.push([mean(segV), mean(segS)]);
      }
      return out;
    };

    // ----- Stage 1 (vocabulary) is fitted once, on the familiar signal -----
    const fit = (() => {
      const x = makeSignal(false);
      const a = analyse(x);
      const smin = Math.min(...a.s);
      const bounds = segment(a.s.map((v) => v - smin));
      const sig = signatures(bounds, a);
      const m = [0, 1].map((d) => mean(sig.map((p) => p[d])));
      const sd = [0, 1].map((d) => std(sig.map((p) => p[d])) || 1);
      const zs = (p) => [(p[0] - m[0]) / sd[0], (p[1] - m[1]) / sd[1]];
      const pts = sig.map(zs);
      // k-means with 3 prototypes, deterministic initialisation
      const order = pts.map((p, i) => i).sort((i, j) => pts[i][0] + pts[i][1] - (pts[j][0] + pts[j][1]));
      let protos = [order[0], order[Math.floor(order.length / 2)], order[order.length - 1]].map((i) => [...pts[i]]);
      for (let it = 0; it < 20; it += 1) {
        const groups = protos.map(() => []);
        pts.forEach((p) => {
          let bi = 0;
          let bd = Infinity;
          protos.forEach((c, ci) => {
            const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
            if (d < bd) {
              bd = d;
              bi = ci;
            }
          });
          groups[bi].push(p);
        });
        protos = protos.map((c, ci) =>
          groups[ci].length ? [mean(groups[ci].map((p) => p[0])), mean(groups[ci].map((p) => p[1]))] : c
        );
      }
      protos.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
      const dists = pts.map((p) => Math.min(...protos.map((c) => Math.hypot(p[0] - c[0], p[1] - c[1]))));
      const tau = Math.max(quantile(dists, 0.5), 0.35);
      // Region the vocabulary covered during fitting: anything beyond it is undescribable.
      const radius = Math.max(1.5 * Math.max(...dists), 0.6);
      return { zs, protos, tau, radius };
    })();

    const run = (unfamiliar) => {
      const x = makeSignal(unfamiliar);
      const a = analyse(x);
      const smin = Math.min(...a.s);
      const bounds = segment(a.s.map((v) => v - smin));
      const pts = signatures(bounds, a).map(fit.zs);
      const assign = pts.map((p) => {
        let bi = 0;
        let bd = Infinity;
        fit.protos.forEach((c, ci) => {
          const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
          if (d < bd) {
            bd = d;
            bi = ci;
          }
        });
        return { concept: bi, d: bd, uncovered: bd > fit.radius };
      });
      const F = Math.exp(-mean(assign.map((q) => q.d)) / fit.tau);
      return { x, a, bounds, pts, assign, F };
    };

    const states = { clean: run(false), ood: run(true) };
    const F_THRESHOLD = 0.15;

    // ----- drawing -----
    const svg = root.querySelector("#ct-main");
    const space = root.querySelector("#ct-space");
    const caption = root.querySelector("#ct-caption");
    const meterFill = root.querySelector("#ct-meter");
    const meterThresh = root.querySelector("#ct-thresh");
    const fValue = root.querySelector("#ct-F");
    const verdict = root.querySelector("#ct-verdict");
    const stepBtns = [...root.querySelectorAll("[data-step]")];
    const inputBtns = [...root.querySelectorAll("[data-input]")];

    const W = 760;
    const X0 = 14;
    const X1 = 746;
    const P1 = [30, 182];
    const P2 = [214, 300];
    const xs = Array.from({ length: T }, (_, t) => X0 + (t * (X1 - X0)) / (T - 1));
    const allX = [...states.clean.x, ...states.ood.x];
    const vMin = Math.min(...allX) - 0.15;
    const vMax = Math.max(...allX) + 0.15;
    const y1 = (v) => P1[1] - ((v - vMin) / (vMax - vMin)) * (P1[1] - P1[0]);
    const allS = [...states.clean.a.s, ...states.ood.a.s];
    const sLo = Math.min(...allS);
    const sHi = quantile(allS, 0.985);
    const y2 = (v) => P2[1] - Math.min(1, (v - sLo) / (sHi - sLo)) * (P2[1] - P2[0]);
    if (meterThresh) meterThresh.style.left = `${F_THRESHOLD * 100}%`;

    const CAPTIONS = [
      "<b>1 · Raw signal.</b> An unlabeled multivariate time series (one channel shown). Nothing about its structure is given in advance.",
      "<b>2 · Forecast.</b> A frozen autoregressive Gaussian density model predicts a distribution over the next value at every step: a mean μ<sub>t</sub> and a calibrated variance σ<sub>t</sub><sup>2</sup> (band).",
      "<b>3 · Predictive surprise.</b> The negative log-likelihood of what actually happened, s<sub>t</sub>. It spikes where the model was confident and wrong, which is where the signal changes regime.",
      "<b>4 · Segment.</b> Length-constrained dynamic programming places exactly K boundaries where cumulative surprise is highest, so segments follow the signal's own dynamics instead of fixed windows.",
      "<b>5 · Concepts.</b> Each segment is summarised by how it behaved relative to the forecast (here: average predictive variance and average surprise, the two axes of Figure 1). Clustering these signatures, without labels, gives a small vocabulary of concepts.",
      "<b>6 · Fidelity.</b> Distance from each segment to its nearest concept prototype gives a built-in fidelity score F(x). Inputs the vocabulary cannot describe get a low score, and the model abstains.",
    ];

    // Static scaffolding
    clear(svg);
    const defs = el("defs", {}, svg);
    const clipBand = el("clipPath", { id: "ct-clip-band" }, defs);
    const clipBandRect = el("rect", { x: 0, y: 0, width: 0, height: 330 }, clipBand);
    const clipS = el("clipPath", { id: "ct-clip-s" }, defs);
    const clipSRect = el("rect", { x: 0, y: 0, width: 0, height: 330 }, clipS);

    const gBands = el("g", {}, svg);
    el("line", { x1: X0, x2: X1, y1: P2[1], y2: P2[1], stroke: COLORS.grid }, svg);
    el("text", { x: X0, y: 16, class: "svg-label" }, svg).textContent = "Signal and forecaster prediction (μ ± 2σ)";
    el("text", { x: X0, y: P2[0] - 8, class: "svg-label" }, svg).textContent = "Predictive surprise sₜ (NLL)";
    const gForecast = el("g", { "clip-path": "url(#ct-clip-band)" }, svg);
    const bandPath = el("path", { fill: COLORS.accent, "fill-opacity": 0.13 }, gForecast);
    const muPath = el("path", { fill: "none", stroke: COLORS.accent, "stroke-width": 1.4, "stroke-dasharray": "4 3" }, gForecast);
    const sigPath = el("path", { fill: "none", stroke: COLORS.ink, "stroke-width": 1.6, "stroke-linejoin": "round" }, svg);
    const gSurprise = el("g", { "clip-path": "url(#ct-clip-s)" }, svg);
    const sArea = el("path", { fill: COLORS.surprise, "fill-opacity": 0.16 }, gSurprise);
    const sLine = el("path", { fill: "none", stroke: COLORS.surprise, "stroke-width": 1.5 }, gSurprise);
    const gBounds = el("g", {}, svg);
    const gChips = el("g", {}, svg);

    // Concept space scaffolding
    clear(space);
    const SX = [34, 228];
    const SY = [14, 156];
    el("line", { x1: SX[0], x2: SX[1], y1: SY[1], y2: SY[1], stroke: COLORS.grid }, space);
    el("line", { x1: SX[0], x2: SX[0], y1: SY[0], y2: SY[1], stroke: COLORS.grid }, space);
    el("text", { x: SX[1], y: SY[1] + 16, "text-anchor": "end", class: "svg-label" }, space).textContent = "predictive variance →";
    el("text", { x: 0, y: 0, transform: `translate(${SX[0] - 10},${SY[1]}) rotate(-90)`, class: "svg-label" }, space).textContent =
      "surprise (NLL) →";
    const allPts = [...states.clean.pts, ...states.ood.pts, ...fit.protos];
    const px = allPts.map((p) => p[0]);
    const py = allPts.map((p) => p[1]);
    const pad = 0.6;
    const sxScale = (v) => SX[0] + 10 + ((v - Math.min(...px) + pad) / (Math.max(...px) - Math.min(...px) + 2 * pad)) * (SX[1] - SX[0] - 16);
    const syScale = (v) => SY[1] - 8 - ((v - Math.min(...py) + pad) / (Math.max(...py) - Math.min(...py) + 2 * pad)) * (SY[1] - SY[0] - 12);
    const gLinks = el("g", {}, space);
    const gProtos = el("g", {}, space);
    const gPts = el("g", {}, space);
    const star = (cx, cy, r) => {
      let d = "";
      for (let i = 0; i < 10; i += 1) {
        const rr = i % 2 ? r * 0.45 : r;
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        d += `${i ? "L" : "M"}${(cx + rr * Math.cos(ang)).toFixed(1)},${(cy + rr * Math.sin(ang)).toFixed(1)}`;
      }
      return `${d}Z`;
    };
    const NAMES = ["A · expected", "B · transitional", "C · surprising"];
    fit.protos.forEach((c, i) => {
      const cx = sxScale(c[0]);
      const cy = syScale(c[1]);
      el("circle", { cx, cy, r: Math.abs(sxScale(c[0] + fit.radius) - cx), fill: COLORS.concept[i], "fill-opacity": 0.07 }, gProtos);
      el("path", { d: star(cx, cy, 8), fill: COLORS.ink, stroke: "#fff", "stroke-width": 1.5 }, gProtos);
      el("text", { x: cx + 10, y: cy - 6, class: "svg-label strong" }, gProtos).textContent = NAMES[i].split(" ")[0];
    });

    let current = "clean";
    let step = 0;
    let timers = [];
    let stops = [];
    const cancel = () => {
      timers.forEach(clearTimeout);
      stops.forEach((s) => s());
      timers = [];
      stops = [];
    };

    const drawStatic = (state) => {
      const { x, a } = state;
      const up = a.mu.map((m, t) => y1(m + 2 * Math.sqrt(a.s2[t])));
      const lo = a.mu.map((m, t) => y1(m - 2 * Math.sqrt(a.s2[t])));
      bandPath.setAttribute(
        "d",
        `${path(xs, up)}${xs
          .slice()
          .reverse()
          .map((xx, i) => `L${xx.toFixed(1)},${lo[T - 1 - i].toFixed(1)}`)
          .join("")}Z`
      );
      muPath.setAttribute("d", path(xs, a.mu.map(y1)));
      sigPath.setAttribute("d", path(xs, x.map(y1)));
      const sy = a.s.map(y2);
      sLine.setAttribute("d", path(xs, sy));
      sArea.setAttribute("d", `${path(xs, sy)}L${X1},${P2[1]}L${X0},${P2[1]}Z`);
    };

    const drawBounds = (state, animate) => {
      clear(gBounds);
      state.bounds.slice(1, -1).forEach((b, i) => {
        const xx = (xs[b] + xs[b - 1]) / 2;
        const line = el(
          "line",
          { x1: xx, x2: xx, y1: P1[0] - 4, y2: P2[1], stroke: COLORS.ink, "stroke-width": 1.2, "stroke-dasharray": "3 3", class: "drop" },
          gBounds
        );
        el("circle", { cx: xx, cy: y2(state.a.s[b]), r: 3.5, fill: COLORS.surprise, stroke: "#fff", "stroke-width": 1.5, class: "drop" }, gBounds);
        if (animate && !reduceMotion) {
          [...gBounds.querySelectorAll(".drop")].slice(-2).forEach((n) => {
            n.style.opacity = 0;
            n.style.transform = "translateY(-12px)";
            timers.push(
              setTimeout(() => {
                n.style.opacity = 1;
                n.style.transform = "none";
              }, 120 + i * 140)
            );
          });
        }
        return line;
      });
    };

    const drawConcepts = (state, animate) => {
      clear(gBands);
      clear(gChips);
      state.assign.forEach((q, j) => {
        const a = xs[Math.max(0, state.bounds[j] - (j ? 1 : 0))];
        const b = xs[Math.min(T - 1, state.bounds[j + 1] - 1)];
        const xa = j ? (xs[state.bounds[j]] + xs[state.bounds[j] - 1]) / 2 : X0;
        const xb = j < state.assign.length - 1 ? (xs[state.bounds[j + 1]] + xs[state.bounds[j + 1] - 1]) / 2 : X1;
        const color = q.uncovered ? COLORS.rust : COLORS.concept[q.concept];
        const band = el(
          "rect",
          { x: xa, y: P1[0] - 4, width: Math.max(0, xb - xa), height: P2[1] - P1[0] + 4, fill: color, "fill-opacity": q.uncovered ? 0.14 : 0.1, class: "fade" },
          gBands
        );
        const label = q.uncovered ? "?" : "ABC"[q.concept];
        const cx = (xa + xb) / 2;
        const chip = el("g", { class: "fade" }, gChips);
        el("rect", { x: cx - 9, y: P1[0] - 3, width: 18, height: 15, rx: 4, fill: "#fff", stroke: color, "stroke-width": 1.4 }, chip);
        el("text", { x: cx, y: P1[0] + 8, "text-anchor": "middle", class: "svg-chip" }, chip).textContent = label;
        if (animate && !reduceMotion) {
          [band, chip].forEach((n) => {
            n.style.opacity = 0;
            timers.push(
              setTimeout(() => {
                n.style.opacity = 1;
              }, 80 + j * 110)
            );
          });
        }
        return [a, b];
      });
      // concept-space points
      clear(gPts);
      clear(gLinks);
      state.pts.forEach((p, j) => {
        const q = state.assign[j];
        const proto = fit.protos[q.concept];
        const tx = sxScale(p[0]);
        const ty = syScale(p[1]);
        const link = el(
          "line",
          { x1: sxScale(proto[0]), y1: syScale(proto[1]), x2: tx, y2: ty, stroke: q.uncovered ? COLORS.rust : COLORS.muted, "stroke-width": 1, "stroke-dasharray": "2 3", class: "fade" },
          gLinks
        );
        const node = q.uncovered
          ? el("g", {}, gPts)
          : el("circle", { r: 5, fill: COLORS.concept[q.concept], stroke: "#fff", "stroke-width": 2 }, gPts);
        if (q.uncovered) {
          el("circle", { r: 6, fill: "#fff", stroke: COLORS.rust, "stroke-width": 2 }, node);
          el("text", { y: 3.5, "text-anchor": "middle", class: "svg-chip", fill: COLORS.rust }, node).textContent = "?";
        }
        const cx0 = (SX[0] + SX[1]) / 2;
        const cy0 = (SY[0] + SY[1]) / 2;
        const place = (t) => {
          const cx = cx0 + (tx - cx0) * t;
          const cy = cy0 + (ty - cy0) * t;
          if (q.uncovered) node.setAttribute("transform", `translate(${cx},${cy})`);
          else {
            node.setAttribute("cx", cx);
            node.setAttribute("cy", cy);
          }
        };
        if (animate && !reduceMotion) {
          place(0);
          node.style.opacity = 0;
          link.style.opacity = 0;
          timers.push(
            setTimeout(() => {
              node.style.opacity = 1;
              stops.push(tween(700, place, () => (link.style.opacity = 1)));
            }, 120 + j * 110)
          );
        } else place(1);
      });
    };

    const drawFidelity = (state, show) => {
      if (!show) {
        meterFill.style.width = "0%";
        fValue.textContent = "–";
        verdict.textContent = "Waiting for step 6";
        verdict.classList.remove("is-abstain");
        return;
      }
      const ok = state.F >= F_THRESHOLD;
      meterFill.style.width = `${Math.min(100, state.F * 100).toFixed(1)}%`;
      meterFill.style.background = ok ? COLORS.accent : COLORS.rust;
      fValue.textContent = state.F.toFixed(2);
      verdict.textContent = ok ? "✓ Covered by the vocabulary: predict" : "⚠ Unfamiliar regime: abstain";
      verdict.classList.toggle("is-abstain", !ok);
    };

    const render = (target, animate) => {
      const state = states[current];
      drawStatic(state);
      // layer 1: signal
      const len = sigPath.getTotalLength ? sigPath.getTotalLength() : 2000;
      if (target >= 1) {
        sigPath.style.opacity = 1;
        if (animate && target === 1 && !reduceMotion) {
          sigPath.style.strokeDasharray = `${len}`;
          stops.push(
            tween(1300, (t) => {
              sigPath.style.strokeDashoffset = `${len * (1 - t)}`;
            })
          );
        } else {
          sigPath.style.strokeDasharray = "none";
          sigPath.style.strokeDashoffset = "0";
        }
      } else sigPath.style.opacity = 0;
      // layer 2: forecast band (wipe)
      if (target >= 2) {
        if (animate && target === 2) stops.push(tween(1300, (t) => clipBandRect.setAttribute("width", W * t)));
        else clipBandRect.setAttribute("width", W);
      } else clipBandRect.setAttribute("width", 0);
      // layer 3: surprise (wipe)
      if (target >= 3) {
        if (animate && target === 3) stops.push(tween(1300, (t) => clipSRect.setAttribute("width", W * t)));
        else clipSRect.setAttribute("width", W);
      } else clipSRect.setAttribute("width", 0);
      // layer 4: boundaries
      if (target >= 4) drawBounds(state, animate && target === 4);
      else clear(gBounds);
      // layer 5: concepts
      if (target >= 5) drawConcepts(state, animate && target === 5);
      else {
        clear(gBands);
        clear(gChips);
        clear(gPts);
        clear(gLinks);
      }
      gProtos.style.opacity = target >= 5 ? 1 : 0.25;
      // layer 6: fidelity
      drawFidelity(state, target >= 6);
    };

    const goTo = (n, animate = true) => {
      cancel();
      step = n;
      stepBtns.forEach((b) => {
        const s = Number(b.dataset.step);
        b.classList.toggle("is-active", s === n);
        b.classList.toggle("is-done", s < n);
        b.setAttribute("aria-current", s === n ? "step" : "false");
      });
      caption.innerHTML = CAPTIONS[n - 1];
      render(n, animate);
    };

    const autoplay = (from = 1) => {
      cancel();
      const play = (n) => {
        goTo(n, true);
        if (n < 6) timers.push(setTimeout(() => play(n + 1), 2300));
      };
      play(from);
    };

    stepBtns.forEach((b) => b.addEventListener("click", () => goTo(Number(b.dataset.step))));
    inputBtns.forEach((b) =>
      b.addEventListener("click", () => {
        current = b.dataset.input;
        inputBtns.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
        if (step < 4) goTo(6, false);
        else {
          cancel();
          step = 6;
          stepBtns.forEach((sb) => {
            const s = Number(sb.dataset.step);
            sb.classList.toggle("is-active", s === 6);
            sb.classList.toggle("is-done", s < 6);
          });
          caption.innerHTML =
            current === "ood"
              ? "<b>Unfamiliar input.</b> Sensor noise unlike anything in the training data is injected. The same frozen vocabulary is used, but the noisy segment lands far from every prototype, so fidelity drops and the model abstains instead of guessing."
              : CAPTIONS[5];
          render(4, false);
          drawConcepts(states[current], true);
          gProtos.style.opacity = 1;
          drawFidelity(states[current], true);
        }
      })
    );
    const replay = root.querySelector("[data-replay]");
    if (replay) replay.addEventListener("click", () => autoplay(1));

    goTo(reduceMotion ? 6 : 1, false);
    if (!reduceMotion) {
      sigPath.style.opacity = 0;
      onFirstView(root, () => autoplay(1));
    }
    root.dataset.ready = "true";
    root.dataset.debug = JSON.stringify({
      cleanF: states.clean.F.toFixed(3),
      oodF: states.ood.F.toFixed(3),
      tau: fit.tau.toFixed(3),
      cleanBounds: states.clean.bounds,
      oodBounds: states.ood.bounds,
      cleanConcepts: states.clean.assign.map((q) => (q.uncovered ? "?" : q.concept)),
      oodConcepts: states.ood.assign.map((q) => (q.uncovered ? "?" : q.concept)),
    });
  }

  // =====================================================================
  // EntroPE: entropy-guided vs fixed-length patching
  // =====================================================================
  const ep = document.getElementById("ep-demo");
  if (ep) initEntroPE(ep);

  function initEntroPE(root) {
    const T = 168;
    const LMAX = 40;
    const V = 64;

    // Synthetic window with regime changes: a spike and several level shifts
    // on top of a smooth, predictable oscillation.
    const x = (() => {
      const r = rng(23);
      const levels = [
        [0, 0],
        [30, 0.95],
        [58, 0.2],
        [90, 1.15],
        [118, -0.45],
        [145, 0.5],
      ];
      const out = [];
      for (let t = 0; t < T; t += 1) {
        let level = 0;
        levels.forEach(([start, v]) => {
          if (t >= start) level = v;
        });
        let v = level + 0.25 * Math.sin((2 * Math.PI * t) / 26) + 0.07 * Math.sin((2 * Math.PI * t) / 6.5);
        v += 1.1 * Math.exp(-((t - 15) ** 2) / 1.6);
        v += 0.03 * gauss(r);
        out.push(v);
      }
      return out;
    })();

    // Toy entropy model: categorical entropy (nats) of the next quantised value
    // under a Gaussian whose width tracks recent prediction errors.
    const R = Math.max(Math.abs(quantile(x, 0.0025)), Math.abs(quantile(x, 0.9975)));
    const binW = (2 * R) / V;
    const h = (() => {
      const out = [];
      let v = 0.002;
      for (let t = 0; t < T; t += 1) {
        const res = t ? x[t] - x[t - 1] : 0;
        v = 0.3 * v + 0.7 * res * res;
        const s2 = v + 0.001;
        const H = 0.5 * Math.log((2 * Math.PI * Math.E * s2) / (binW * binW));
        out.push(Math.max(0, Math.min(Math.log(V), H)));
      }
      return out;
    })();

    const dynamicBounds = (alpha) => {
      const theta = quantile(h, alpha);
      const starts = [0];
      for (let t = 0; t < T - 1; t += 1) if (h[t] > theta) starts.push(t + 1);
      const uniq = [...new Set(starts)];
      const out = [];
      uniq.forEach((s, i) => {
        const e = i < uniq.length - 1 ? uniq[i + 1] : T;
        for (let p = s; p < e; p += LMAX) out.push(p);
      });
      return { starts: out, theta };
    };
    const fixedBounds = (n) => {
      const L = Math.max(1, Math.round(T / n));
      const out = [];
      for (let p = 0; p < T; p += L) out.push(p);
      return out;
    };
    const ratio = (starts) => {
      const total = variance(x) * T;
      let within = 0;
      starts.forEach((s, i) => {
        const e = i < starts.length - 1 ? starts[i + 1] : T;
        const seg = x.slice(s, e);
        within += variance(seg) * seg.length;
      });
      return within / total;
    };

    const svg = root.querySelector("#ep-main");
    const modeBtns = [...root.querySelectorAll("[data-mode]")];
    const slider = root.querySelector("#ep-alpha");
    const sliderRow = root.querySelector("#ep-alpha-row");
    const alphaOut = root.querySelector("#ep-alpha-val");
    const out = {
      patches: root.querySelector("#ep-patches"),
      length: root.querySelector("#ep-length"),
      ratioE: root.querySelector("#ep-ratio-e"),
      ratioF: root.querySelector("#ep-ratio-f"),
      gain: root.querySelector("#ep-gain"),
      cut: root.querySelector("#ep-cut"),
    };
    const caption = root.querySelector("#ep-caption");

    const X0 = 14;
    const X1 = 746;
    const P1 = [26, 178];
    const P2 = [212, 292];
    const xs = Array.from({ length: T }, (_, t) => X0 + (t * (X1 - X0)) / (T - 1));
    const vMin = Math.min(...x) - 0.15;
    const vMax = Math.max(...x) + 0.15;
    const y1 = (v) => P1[1] - ((v - vMin) / (vMax - vMin)) * (P1[1] - P1[0]);
    const hLo = Math.min(...h) - 0.2;
    const hHi = Math.max(...h) + 0.2;
    const y2 = (v) => P2[1] - ((v - hLo) / (hHi - hLo)) * (P2[1] - P2[0]);
    const bx = (s) => (s === 0 ? X0 : (xs[s] + xs[s - 1]) / 2);

    clear(svg);
    const defs = el("defs", {}, svg);
    const clip = el("clipPath", { id: "ep-clip" }, defs);
    const clipRect = el("rect", { x: 0, y: 0, width: 800, height: 320 }, clip);
    const gPatches = el("g", {}, svg);
    el("text", { x: X0, y: 14, class: "svg-label" }, svg).textContent = "Input window and its patches";
    el("text", { x: X0, y: P2[0] - 10, class: "svg-label" }, svg).textContent = "Next-step entropy hₜ from a small frozen model (nats)";
    el("line", { x1: X0, x2: X1, y1: P2[1], y2: P2[1], stroke: COLORS.grid }, svg);
    const gSignal = el("g", {}, svg);
    el("path", { d: path(xs, x.map(y1)), fill: "none", stroke: COLORS.ink, "stroke-width": 1.6, "stroke-linejoin": "round" }, gSignal);
    const gEntropy = el("g", { "clip-path": "url(#ep-clip)" }, svg);
    const hy = h.map(y2);
    el("path", { d: `${path(xs, hy)}L${X1},${P2[1]}L${X0},${P2[1]}Z`, fill: COLORS.surprise, "fill-opacity": 0.14 }, gEntropy);
    el("path", { d: path(xs, hy), fill: "none", stroke: COLORS.surprise, "stroke-width": 1.5 }, gEntropy);
    const thLine = el("line", { x1: X0, x2: X1, stroke: COLORS.rust, "stroke-width": 1.2, "stroke-dasharray": "5 4", class: "glide" }, svg);
    const thText = el("text", { x: X1, "text-anchor": "end", class: "svg-label", fill: COLORS.rust }, svg);
    const gBounds = el("g", {}, svg);
    const gMarks = el("g", {}, svg);
    const cursor = el("line", { y1: P1[0] - 6, y2: P2[1], stroke: COLORS.accent, "stroke-width": 2, opacity: 0 }, svg);

    let mode = "entropy";
    let alpha = Number(slider ? slider.value : 0.9);
    let scanning = false;

    const draw = (animate) => {
      const dyn = dynamicBounds(alpha);
      const fixed = fixedBounds(dyn.starts.length);
      const starts = mode === "entropy" ? dyn.starts : fixed;
      const color = mode === "entropy" ? COLORS.accent : COLORS.rust;

      // threshold line
      const ty = y2(dyn.theta);
      thLine.setAttribute("y1", ty);
      thLine.setAttribute("y2", ty);
      thLine.style.opacity = mode === "entropy" ? 1 : 0.25;
      thText.setAttribute("y", ty - 5);
      thText.textContent = `threshold = ${Math.round(alpha * 100)}th percentile`;
      thText.style.opacity = mode === "entropy" ? 1 : 0.25;

      // patches (alternate shading, as in the paper's Figure 8)
      clear(gPatches);
      starts.forEach((s, i) => {
        const e = i < starts.length - 1 ? starts[i + 1] : T;
        const xa = bx(s);
        const xb = e >= T ? X1 : bx(e);
        if (i % 2 === 0) {
          const r = el("rect", { x: xa, y: P1[0] - 6, width: xb - xa, height: P1[1] - P1[0] + 12, fill: "#e9eef0", class: "fade" }, gPatches);
          if (animate) {
            r.style.opacity = 0;
            requestAnimationFrame(() => requestAnimationFrame(() => (r.style.opacity = 1)));
          }
        }
      });

      // boundaries
      clear(gBounds);
      starts.slice(1).forEach((s, i) => {
        const xx = bx(s);
        const line = el(
          "line",
          { x1: xx, x2: xx, y1: P1[0] - 6, y2: P2[1], stroke: color, "stroke-width": 1.4, "stroke-dasharray": "4 3", class: "drop" },
          gBounds
        );
        if (animate && !reduceMotion) {
          line.style.opacity = 0;
          line.style.transform = "translateY(-14px)";
          setTimeout(() => {
            line.style.opacity = 1;
            line.style.transform = "none";
          }, 40 + i * 45);
        }
      });

      // markers: entropy mode -> halos at boundary starts; fixed mode -> transitions cut inside a patch
      clear(gMarks);
      const fixedSet = new Set(fixed);
      const highT = [];
      for (let t = 0; t < T - 1; t += 1) if (h[t] > dyn.theta) highT.push(t + 1);
      const cut = highT.filter((s) => !fixedSet.has(s) && !fixedSet.has(s - 1) && !fixedSet.has(s + 1));
      const marks = mode === "entropy" ? dyn.starts.slice(1) : cut;
      marks.forEach((s, i) => {
        const c = el(
          "circle",
          { cx: xs[s], cy: y1(x[s]), r: 6, fill: color, "fill-opacity": 0.22, stroke: color, "stroke-width": 1.2, class: "fade" },
          gMarks
        );
        if (animate && !reduceMotion) {
          c.style.opacity = 0;
          setTimeout(() => (c.style.opacity = 1), 200 + i * 45);
        }
      });

      // readout
      const rE = ratio(dyn.starts);
      const rF = ratio(fixed);
      const n = starts.length;
      out.patches.textContent = String(n);
      out.length.textContent = (T / n).toFixed(1);
      out.ratioE.textContent = rE.toFixed(3);
      out.ratioF.textContent = rF.toFixed(3);
      out.gain.textContent = `${(rF / rE).toFixed(1)}×`;
      out.cut.textContent = mode === "entropy" ? "0" : String(cut.length);
      if (sliderRow) sliderRow.setAttribute("aria-disabled", "false");

      caption.innerHTML =
        mode === "entropy"
          ? `<b>Entropy-guided patching.</b> A new patch starts right after the frozen model becomes uncertain (entropy above the threshold). Spikes, level shifts, and bursts become boundaries, while predictable stretches stay together in long patches. Drag the threshold: a lower percentile gives finer patches and more compute, a higher one gives coarser patches.`
          : `<b>Fixed-length patching</b> with the same number of patches (length ${Math.round(T / dyn.starts.length)}). Boundaries ignore the signal, so ${cut.length} high-entropy positions (rings) fall inside a patch, mixing a transition with unrelated context. Within-patch variance is ${(rF / rE).toFixed(1)}× higher than with entropy-guided patches.`;
    };

    const scan = () => {
      if (reduceMotion) {
        draw(false);
        return;
      }
      scanning = true;
      const dyn = dynamicBounds(alpha);
      clear(gBounds);
      clear(gMarks);
      clear(gPatches);
      thLine.style.opacity = 1;
      cursor.setAttribute("opacity", 1);
      let shown = 0;
      tween(
        3200,
        (t) => {
          const xx = X0 + (X1 - X0) * t;
          cursor.setAttribute("x1", xx);
          cursor.setAttribute("x2", xx);
          clipRect.setAttribute("width", xx);
          const starts = dyn.starts.slice(1);
          while (shown < starts.length && bx(starts[shown]) <= xx) {
            const s = starts[shown];
            el("line", { x1: bx(s), x2: bx(s), y1: P1[0] - 6, y2: P2[1], stroke: COLORS.accent, "stroke-width": 1.4, "stroke-dasharray": "4 3" }, gBounds);
            el("circle", { cx: xs[s], cy: y1(x[s]), r: 6, fill: COLORS.accent, "fill-opacity": 0.22, stroke: COLORS.accent, "stroke-width": 1.2 }, gMarks);
            shown += 1;
          }
        },
        () => {
          cursor.setAttribute("opacity", 0);
          scanning = false;
          draw(false);
        }
      );
    };

    modeBtns.forEach((b) =>
      b.addEventListener("click", () => {
        if (scanning) return;
        mode = b.dataset.mode;
        modeBtns.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
        draw(true);
      })
    );
    if (slider) {
      slider.addEventListener("input", () => {
        alpha = Number(slider.value);
        alphaOut.textContent = `${Math.round(alpha * 100)}th`;
        if (!scanning) draw(false);
      });
    }
    const replay = root.querySelector("[data-replay]");
    if (replay)
      replay.addEventListener("click", () => {
        if (scanning) return;
        mode = "entropy";
        modeBtns.forEach((o) => o.setAttribute("aria-pressed", String(o.dataset.mode === "entropy")));
        scan();
      });

    draw(false);
    if (!reduceMotion) {
      clipRect.setAttribute("width", 0);
      clear(gBounds);
      clear(gMarks);
      clear(gPatches);
      onFirstView(root, scan);
    }
    const dyn = dynamicBounds(alpha);
    root.dataset.ready = "true";
    root.dataset.debug = JSON.stringify({
      starts: dyn.starts,
      rE: ratio(dyn.starts).toFixed(3),
      rF: ratio(fixedBounds(dyn.starts.length)).toFixed(3),
    });
  }
})();
