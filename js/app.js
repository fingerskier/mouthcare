(() => {
  "use strict";

  const STEPS = [
    { name: "Closys", seconds: 30 },
    { name: "Brush", seconds: 60 },
    { name: "Listerine", seconds: 30 },
    { name: "ACT", seconds: 30 },
  ];

  const RING_R = 54;
  const CIRC = 2 * Math.PI * RING_R;

  /** @typedef {'idle'|'running'|'between'|'finished'} Phase */

  const els = {
    stepList: document.getElementById("step-list"),
    stepLabel: document.getElementById("step-label"),
    countdown: document.getElementById("countdown"),
    ring: document.getElementById("ring-progress"),
    ringWrap: document.querySelector(".ring-wrap"),
    status: document.getElementById("status-text"),
    btn: document.getElementById("btn-primary"),
  };

  /** @type {Phase} */
  let phase = "idle";
  let stepIndex = 0;
  let remainingMs = 0;
  let totalMs = 0;
  /** @type {number|null} */
  let rafId = null;
  /** @type {number|null} */
  let endAt = null;
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playChime() {
    const ctx = ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [880, 1174.66, 1318.51];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02 + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35 + i * 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + 0.4 + i * 0.12);
    });
  }

  function vibrateDone() {
    if (navigator.vibrate) {
      navigator.vibrate([120, 60, 120, 60, 200]);
    }
  }

  function notifyStepComplete() {
    playChime();
    vibrateDone();
  }

  function renderStepList() {
    els.stepList.innerHTML = STEPS.map((step, i) => {
      let cls = "step-item";
      const completed =
        phase === "finished" ||
        (phase === "running" && i < stepIndex) ||
        (phase === "between" && i <= stepIndex);
      const active =
        (phase === "running" && i === stepIndex) ||
        (phase === "between" && i === stepIndex + 1);
      if (completed) cls += " done";
      if (active) cls += " active";
      return `
        <li class="${cls}" data-index="${i}">
          <span class="name">${step.name}</span>
          <span class="dur">${step.seconds}s</span>
        </li>`;
    }).join("");
  }

  function setRingProgress(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    els.ring.style.strokeDasharray = String(CIRC);
    els.ring.style.strokeDashoffset = String(CIRC * (1 - clamped));
  }

  function formatSeconds(ms) {
    return String(Math.max(0, Math.ceil(ms / 1000)));
  }

  function setButton(label, modeClass) {
    els.btn.textContent = label;
    els.btn.classList.remove("continue", "done");
    if (modeClass) els.btn.classList.add(modeClass);
    els.btn.disabled = false;
  }

  function showIdle() {
    phase = "idle";
    stepIndex = 0;
    remainingMs = 0;
    totalMs = 0;
    endAt = null;
    els.ringWrap.classList.remove("complete");
    els.stepLabel.textContent = "Ready";
    els.countdown.textContent = "—";
    els.status.textContent = "Tap Start to begin your routine";
    setRingProgress(0);
    setButton("Start");
    renderStepList();
  }

  function startStep(index) {
    const step = STEPS[index];
    phase = "running";
    stepIndex = index;
    totalMs = step.seconds * 1000;
    remainingMs = totalMs;
    endAt = performance.now() + totalMs;
    els.ringWrap.classList.remove("complete");
    els.stepLabel.textContent = step.name;
    els.countdown.textContent = formatSeconds(remainingMs);
    els.status.textContent = `Step ${index + 1} of ${STEPS.length}`;
    setRingProgress(1);
    setButton("…", null);
    els.btn.disabled = true;
    renderStepList();
    tick();
  }

  function cancelRaf() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function tick() {
    cancelRaf();
    const now = performance.now();
    remainingMs = Math.max(0, (endAt ?? now) - now);
    els.countdown.textContent = formatSeconds(remainingMs);
    setRingProgress(totalMs > 0 ? remainingMs / totalMs : 0);

    if (remainingMs <= 0) {
      onStepTimerDone();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function onStepTimerDone() {
    cancelRaf();
    remainingMs = 0;
    setRingProgress(0);
    els.countdown.textContent = "0";
    els.ringWrap.classList.add("complete");
    notifyStepComplete();

    if (stepIndex >= STEPS.length - 1) {
      phase = "finished";
      els.stepLabel.textContent = "All done";
      els.status.textContent = "Nice work — mouthcare complete";
      setButton("Restart", "done");
      renderStepList();
      return;
    }

    phase = "between";
    const next = STEPS[stepIndex + 1];
    els.stepLabel.textContent = `${STEPS[stepIndex].name} done`;
    els.status.textContent = `Next up: ${next.name} (${next.seconds}s)`;
    setButton("Continue", "continue");
    renderStepList();
  }

  function onPrimaryClick() {
    ensureAudio();

    if (phase === "idle" || phase === "finished") {
      startStep(0);
      return;
    }

    if (phase === "between") {
      startStep(stepIndex + 1);
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
        // Offline install is best-effort; app still works online.
      });
    });
  }

  // Init ring geometry once
  els.ring.style.strokeDasharray = String(CIRC);
  els.ring.style.strokeDashoffset = String(CIRC);

  els.btn.addEventListener("click", onPrimaryClick);
  showIdle();
  registerServiceWorker();
})();
