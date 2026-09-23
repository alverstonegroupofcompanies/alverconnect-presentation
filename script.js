import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Snap from "lenis/snap";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

// Clear leftover PWA caches from when the service worker ran in dev.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    });
  }
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

const slides = [...document.querySelectorAll(".slide")];
const navDots = [...document.querySelectorAll(".nav-dot")];
const loader = document.getElementById("loader");
const toast = document.getElementById("toast");
const cursor = document.getElementById("cursor");
const cursorDot = document.getElementById("cursorDot");
const slideCurrent = document.getElementById("slideCurrent");
const deckBar = document.querySelector("#deckBar span");
const prevBtn = document.getElementById("prevSlide");
const nextBtn = document.getElementById("nextSlide");
const logoDark = document.querySelector(".logo-on-dark");
const logoLight = document.querySelector(".logo-on-light");

const TOTAL = slides.length;
const SLUGS = slides.map((slide) => slide.id);

let index = 0;
let scrollingTo = false;
let lenis = null;
let snap = null;
const revealTweens = new WeakMap();

const CHALLENGE_TOTAL = 6;
let challengeStep = 1;
let challengeLock = false;
let challengeGate = 0;

const CARD_SEL =
  ".challenge-card, .feature-card, .check-item, .hosp-card, .doctors-card, .why-card, .how-steps > .step, .process-flow > .step, .way-card, .ways-benefits > li, .bento-card, .pill-card, .stage, .cta-card";

function pad(n) {
  return String(n).toString().padStart(2, "0");
}

function parseHash() {
  const raw = (location.hash || "").replace("#", "");
  if (!raw) return 0;
  const slideMatch = raw.match(/^slide-(\d+)$/i);
  if (slideMatch) {
    const n = Number(slideMatch[1]) - 1;
    return Number.isFinite(n) ? Math.max(0, Math.min(TOTAL - 1, n)) : 0;
  }
  const slugIndex = SLUGS.indexOf(raw);
  return slugIndex >= 0 ? slugIndex : 0;
}

function setHash(i, replace) {
  const url = `#slide-${i + 1}`;
  const state = { slide: i };
  if (replace) history.replaceState(state, "", url);
  else if (location.hash !== url) history.pushState(state, "", url);
}

function updateChrome(i) {
  const theme = slides[i]?.dataset.theme || "dark";
  slideCurrent.textContent = pad(i + 1);
  deckBar.style.width = `${((i + 1) / TOTAL) * 100}%`;
  navDots.forEach((dot, di) => dot.classList.toggle("is-active", di === i));
  if (prevBtn) prevBtn.disabled = i === 0;
  if (nextBtn) nextBtn.disabled = i === TOTAL - 1;
  document.body.classList.toggle("is-dark-nav", theme === "dark");
  document.body.classList.toggle("is-light-nav", theme === "light");
  if (logoDark && logoLight) {
    logoDark.hidden = theme === "light";
    logoLight.hidden = theme === "dark";
  }
}

let pendingSlide = null;

function isChallengesSlide(slide = slides[index]) {
  return slide?.classList.contains("challenges-slide");
}

function getChallengeSlots(slide = slides[index]) {
  return [...(slide?.querySelectorAll(".fan-slot") || [])];
}

function armChallengeGate(ms = 720) {
  challengeGate = Date.now() + ms;
}

function lockChallenge(ms = 480) {
  challengeLock = true;
  window.setTimeout(() => {
    challengeLock = false;
  }, ms);
}

function applyChallengeStep(step, { fromReveal = false } = {}) {
  const slide = document.querySelector(".challenges-slide");
  if (!slide) return;
  challengeStep = Math.max(1, Math.min(CHALLENGE_TOTAL, step));
  const isOverview = challengeStep === CHALLENGE_TOTAL;
  slide.dataset.card = isOverview ? "all" : String(challengeStep);
  slide.classList.toggle("is-overview", isOverview);
  const slots = getChallengeSlots(slide);
  const featuredIndex = isOverview ? 0 : challengeStep - 1;
  slots.forEach((slot, i) => {
    slot.classList.add("is-on");
    if (isOverview) {
      slot.classList.remove("is-featured");
      slot.removeAttribute("data-offset");
    } else {
      const offset = i - featuredIndex;
      slot.classList.toggle("is-featured", offset === 0);
      slot.dataset.offset = String(offset);
    }
    const card = slot.querySelector(".challenge-card");
    if (!card) return;
    if (fromReveal && !reduceMotion) {
      gsap.fromTo(
        card,
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.42,
          delay: i * 0.08,
          ease: "power3.out",
          onComplete: () => gsap.set(card, { clearProps: "transform" }),
        }
      );
    } else {
      gsap.set(card, { autoAlpha: 1, clearProps: "transform" });
    }
  });
  if (isMobile()) {
    slots[isOverview ? 0 : featuredIndex]?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }
}

function canStepChallenge(dir) {
  if (!isChallengesSlide()) return false;
  return dir > 0 ? challengeStep < CHALLENGE_TOTAL : challengeStep > 1;
}

function stepChallenge(dir) {
  if (!canStepChallenge(dir) || challengeLock) return false;
  applyChallengeStep(challengeStep + dir);
  lockChallenge();
  return true;
}

function consumeChallengeScroll(dir) {
  if (!isChallengesSlide() || !dir) return false;
  if (scrollingTo || Date.now() < challengeGate) return true;
  if (canStepChallenge(dir)) {
    stepChallenge(dir);
    return true;
  }
  return false;
}

function setActive(i, force = false) {
  if (i === index && !force) return;
  const prevIndex = index;
  const prev = slides[index];
  if (prev && prev !== slides[i]) finalizeReveal(prev);
  if (slides[i]?.classList.contains("challenges-slide")) {
    challengeStep = prevIndex > i ? CHALLENGE_TOTAL : 1;
    armChallengeGate();
  }
  index = i;
  slides.forEach((slide, si) => {
    const on = si === i;
    slide.classList.toggle("is-active", on);
    slide.setAttribute("aria-hidden", on ? "false" : "true");
  });
  updateChrome(i);
  setHash(i, true);
  prepareReveal(slides[i]);
  pendingSlide = slides[i];
  if (reduceMotion || !snap || slides[i].classList.contains("challenges-slide")) {
    playReveal(slides[i]);
    pendingSlide = null;
  }
}

function wrapTitleWords() {
  document.querySelectorAll(".mask-title .word").forEach((word) => {
    if (word.querySelector(".word-inner")) return;
    const inner = document.createElement("span");
    inner.className = "word-inner";
    while (word.firstChild) inner.appendChild(word.firstChild);
    word.appendChild(inner);
  });
}

function getSlideTitle(slide) {
  return slide.querySelector("h1.mask-title, h2.mask-title, .cta-title");
}

function killReveal(slide) {
  const stored = revealTweens.get(slide);
  if (stored) {
    stored.kill();
    revealTweens.delete(slide);
  }
  gsap.killTweensOf(slide.querySelectorAll(".reveal-item, .mask-title, .hero-visual, .hero-person, .doctors-person, .doctors-phone, .why-scene, .split-visual, .secure-visual, .lead, .statement, .site-footer, .flow-arrow, .eyebrow, .hero-sub, .cta-title, .title-overlay, .title-overlay-text"));
  slide.querySelectorAll(".title-overlay").forEach((el) => el.remove());
  getSlideTitle(slide)?.classList.remove("is-fullscreen-title");
  slide.classList.remove("is-title-moment", "is-ready-reveal");
}

function finalizeReveal(slide) {
  killReveal(slide);
  gsap.set(slide.querySelectorAll(".reveal-item, .mask-title, .hero-visual, .hero-person, .doctors-person, .doctors-phone, .why-scene, .split-visual, .secure-visual, .lead, .statement, .site-footer, .flow-arrow, .eyebrow, .hero-sub, .cta-title"), {
    autoAlpha: 1,
    opacity: 1,
    x: 0,
    xPercent: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    clearProps: "transform",
  });
  gsap.set(slide.querySelectorAll(".word-inner"), { yPercent: 0, opacity: 1, rotate: 0 });
  gsap.set(slide.querySelectorAll(".mask-title"), { clipPath: "inset(0% 0% 0% 0%)" });
  slide.querySelector(".glow-line")?.classList.add("is-on");
  if (slide.classList.contains("challenges-slide")) applyChallengeStep(challengeStep);
  layoutAboutConnectors(slide);
}

function layoutAboutConnectors(slide = slides[index]) {
  if (!slide?.classList.contains("about-slide")) return;
  const orbit = slide.querySelector(".about-orbit");
  if (!orbit || orbit.offsetWidth < 40) return;
  const o = orbit.getBoundingClientRect();
  const cx = o.left + o.width / 2;
  const cy = o.top + o.height / 2;
  const r = Math.max(24, o.width / 2 - 6);

  slide.querySelectorAll(".about-node").forEach((node) => {
    const pill = node.querySelector(".about-pill") || node;
    const num = node.querySelector(".card-num");
    const link = node.querySelector(".about-link");
    const dot = slide.querySelector(`.about-dot[data-node="${node.dataset.node}"]`);
    if (!pill || !dot || !num || !link) return;

    const pillRect = pill.getBoundingClientRect();
    const midY = pillRect.top + pillRect.height / 2;
    const dy = Math.max(-r + 4, Math.min(r - 4, midY - cy));
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    const dotX = cx - dx;
    const dotY = cy + dy;

    dot.style.top = `${dotY - o.top}px`;
    dot.style.left = `${dotX - o.left}px`;

    const nodeBox = node.getBoundingClientRect();
    const numRect = num.getBoundingClientRect();
    const x1 = numRect.right + 8;
    const y1 = numRect.top + numRect.height / 2;
    const x2 = dotX;
    const y2 = dotY;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

    link.style.left = `${x1 - nodeBox.left}px`;
    link.style.top = `${y1 - nodeBox.top}px`;
    link.style.width = `${Math.max(0, len)}px`;
    link.style.transform = `translateY(-50%) rotate(${angle}deg)`;
  });
}

function getHeroPeople(slide) {
  const ordered = [".hero-doctor", ".hero-doc-2", ".hero-doc-3", ".hero-doc-4"]
    .map((sel) => slide.querySelector(sel))
    .filter(Boolean);
  return ordered.length ? ordered : [...slide.querySelectorAll(".hero-person")];
}

function hideEls(slide) {
  const title = getSlideTitle(slide);
  const fanCards = [...slide.querySelectorAll(".challenges-fan .challenge-card")];
  const cards = [...slide.querySelectorAll(CARD_SEL)].filter((el) => !fanCards.includes(el));
  const arrows = [...slide.querySelectorAll(".flow-arrow")];
  const intro = [...slide.querySelectorAll(".eyebrow, .lead, .hero-sub")];
  const people = getHeroPeople(slide);
  const doctorsAssets = [...slide.querySelectorAll(".doctors-person, .doctors-phone")];
  const whyVisual = [...slide.querySelectorAll(".why-scene")];
  const rest = [...slide.querySelectorAll(".hero-visual, .split-visual, .photo-panel, .secure-visual, .hospitals-hero, .cta-visual-wrap, .statement, .site-footer, .cta-banner, .scroll-hint, .btn, .cta-btn, .about-core, .about-aside, .how-aside, .hosp-aside, .ways-aside, .how-path")].filter(
    (el) =>
      !intro.includes(el) &&
      !cards.includes(el) &&
      !people.includes(el) &&
      !doctorsAssets.includes(el) &&
      !whyVisual.includes(el) &&
      el !== title &&
      !title?.contains(el) &&
      !cards.some((card) => card.contains(el)) &&
      !el.querySelector(".hero-person")
  );
  return { title, cards, arrows, intro, people, doctorsAssets, whyVisual, rest, hide: [...new Set([...intro, ...cards, ...rest, ...arrows])] };
}

function prepareReveal(slide) {
  if (!slide) return;
  killReveal(slide);
  const { title, hide, people, doctorsAssets, whyVisual } = hideEls(slide);
  if (reduceMotion) {
    finalizeReveal(slide);
    return;
  }
  slide.querySelector(".glow-line")?.classList.remove("is-on");
  gsap.set(hide, { autoAlpha: 0, y: 26, x: 0, xPercent: 0, scale: 1 });
  gsap.set(people, { autoAlpha: 0, xPercent: -46, x: 0, y: 0 });
  gsap.set(doctorsAssets, { autoAlpha: 0, x: -120, xPercent: 0, y: 0 });
  gsap.set(whyVisual, { autoAlpha: 0, x: 160, xPercent: 0, y: 0 });
  if (title) gsap.set(title, { autoAlpha: 0, y: 18, x: 0, scale: 1 });
  if (slide.classList.contains("hero-slide")) {
    const heroVisual = slide.querySelector(".hero-visual");
    if (heroVisual) gsap.set(heroVisual, { x: 0, y: 0, scale: 1, clearProps: "transform" });
  }
  if (slide.classList.contains("challenges-slide")) {
    applyChallengeStep(challengeStep);
    gsap.set(slide.querySelectorAll(".challenges-fan .challenge-card"), { autoAlpha: 0, x: 72, y: 0 });
  }
  slide.classList.add("is-ready-reveal");
}

function playReveal(slide) {
  if (!slide) return;
  if (reduceMotion) {
    finalizeReveal(slide);
    return;
  }
  if (!slide.classList.contains("is-ready-reveal")) prepareReveal(slide);

  const { title, cards, arrows, intro, people, doctorsAssets, whyVisual, rest } = hideEls(slide);
  const stored = revealTweens.get(slide);
  stored?.kill();

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  revealTweens.set(slide, tl);

  if (title) tl.to(title, { autoAlpha: 1, y: 0, duration: 0.45 }, 0);
  tl.to(intro, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.07 }, title ? "-=0.18" : 0)
    .to(people, { autoAlpha: 1, xPercent: 0, duration: 1.05, stagger: 0.16, ease: "power3.out" }, "-=0.22");

  if (doctorsAssets.length) {
    tl.to(
      doctorsAssets,
      { autoAlpha: 1, x: 0, duration: 0.85, stagger: 0.22, ease: "power3.out" },
      "-=0.28"
    );
  }

  if (whyVisual.length) {
    tl.to(
      whyVisual,
      { autoAlpha: 1, x: 0, duration: 1.05, ease: "power3.out" },
      "-=0.55"
    );
  }

  tl.to(cards, { autoAlpha: 1, y: 0, duration: 0.46, stagger: 0.13, ease: "power3.out" }, "-=0.12")
    .to(arrows, { autoAlpha: 1, duration: 0.26, stagger: 0.13 }, "<0.1")
    .to(rest, { autoAlpha: 1, y: 0, duration: 0.46, stagger: 0.07 }, "-=0.18")
    .add(() => {
      slide.querySelector(".glow-line")?.classList.add("is-on");
      requestAnimationFrame(() => layoutAboutConnectors(slide));
    });

  if (slide.classList.contains("challenges-slide")) {
    const fanCards = [...slide.querySelectorAll(".challenges-fan .challenge-card")];
    tl.to(
      fanCards,
      {
        autoAlpha: 1,
        x: 0,
        duration: 0.55,
        stagger: 0.05,
        ease: "power3.out",
        onComplete: () => gsap.set(fanCards, { clearProps: "transform" }),
      },
      0
    );
  }
}

function revealSlide(slide) {
  prepareReveal(slide);
  playReveal(slide);
}

function slideTop(i) {
  return slides[i].offsetTop;
}

function goTo(next, options = {}) {
  const { fromHash = false, replace = false } = options;
  const target = Math.max(0, Math.min(TOTAL - 1, next));
  if (target === index && !options.force && !fromHash) return;

  scrollingTo = true;
  setActive(target, Boolean(options.force || fromHash));
  if (!fromHash) setHash(target, replace);

  const y = slideTop(target);

  if (reduceMotion) {
    window.scrollTo(0, y);
    scrollingTo = false;
    if (pendingSlide) {
      playReveal(pendingSlide);
      pendingSlide = null;
    }
    return;
  }

  if (snap) {
    snap.goTo(target);
    window.setTimeout(() => {
      scrollingTo = false;
      if (pendingSlide) {
        playReveal(pendingSlide);
        pendingSlide = null;
      }
    }, 1400);
  } else if (lenis) {
    lenis.scrollTo(y, {
      duration: 1.15,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      onComplete: () => {
        scrollingTo = false;
        if (pendingSlide) {
          playReveal(pendingSlide);
          pendingSlide = null;
        }
      },
    });
  } else {
    window.scrollTo({ top: y, behavior: "smooth" });
    window.setTimeout(() => {
      scrollingTo = false;
    }, 1200);
  }
}

function next() {
  if (scrollingTo) return;
  if (stepChallenge(1)) return;
  goTo(index + 1);
}

function prev() {
  if (scrollingTo) return;
  if (stepChallenge(-1)) return;
  goTo(index - 1);
}

function currentFromScroll() {
  const mid = window.scrollY + window.innerHeight * 0.42;
  let best = 0;
  slides.forEach((slide, i) => {
    if (slide.offsetTop <= mid) best = i;
  });
  return best;
}

function playLoader(done) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    loader?.remove();
    document.body.classList.add("loaded");
    done();
  };

  if (!loader) {
    document.body.classList.add("loaded");
    done();
    return;
  }

  window.setTimeout(finish, 2200);

  if (reduceMotion) {
    finish();
    return;
  }

  gsap
    .timeline({ defaults: { ease: "power3.out" }, onComplete: finish })
    .from(".loader-mark", { scale: 0.4, rotate: -18, opacity: 0, duration: 0.55, ease: "back.out(1.6)" })
    .from(".loader-word, .loader-sub", { y: 16, opacity: 0, stagger: 0.08, duration: 0.4 }, 0.2)
    .to(".loader-bar span", { width: "100%", duration: 0.7 }, 0.18)
    .to(loader, { yPercent: -100, duration: 0.62, ease: "power4.inOut" }, 1.05);
}

function initLenis() {
  if (reduceMotion) return;

  lenis = new Lenis({
    duration: 1.15,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    smoothWheel: true,
    touchMultiplier: 1.4,
    virtualScroll: ({ deltaY }) => {
      const dir = deltaY > 4 ? 1 : deltaY < -4 ? -1 : 0;
      if (dir && consumeChallengeScroll(dir)) return false;
      return true;
    },
  });

  lenis.on("scroll", () => {
    ScrollTrigger.update();
    if (scrollingTo) return;
    const nextIndex = currentFromScroll();
    if (nextIndex !== index) setActive(nextIndex);
  });

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  snap = new Snap(lenis, {
    type: "mandatory",
    duration: 1.15,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    debounce: 40,
    onSnapComplete: () => {
      scrollingTo = false;
      if (pendingSlide) {
        playReveal(pendingSlide);
        pendingSlide = null;
      }
    },
  });
  snap.addElements(slides, { align: "start" });
}

function initChallengeWheel() {
  if (lenis) return;
  window.addEventListener(
    "wheel",
    (e) => {
      const dir = e.deltaY > 8 ? 1 : e.deltaY < -8 ? -1 : 0;
      if (dir && consumeChallengeScroll(dir)) e.preventDefault();
    },
    { passive: false }
  );
}

function initScrollWatch() {
  if (lenis) return;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollingTo) return;
      const nextIndex = currentFromScroll();
      if (nextIndex !== index) setActive(nextIndex);
    },
    { passive: true }
  );
}

function initScrollParallax() {
  if (reduceMotion) return;

  slides.forEach((slide) => {
    const bg = slide.querySelector(".layer-bg");
    const mid = slide.querySelector(".layer-mid");
    const fg = slide.querySelector(".layer-fg");
    const visual = slide.querySelector(".hero-visual, .split-visual, .subject-soft");

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: slide,
        start: "top bottom",
        end: "bottom top",
        scrub: 0.65,
      },
    });

    if (bg) tl.fromTo(bg, { yPercent: -8 }, { yPercent: 8, ease: "none" }, 0);
    if (mid) tl.fromTo(mid, { yPercent: -14 }, { yPercent: 14, ease: "none" }, 0);
    if (fg) tl.fromTo(fg, { yPercent: 2 }, { yPercent: -2, ease: "none" }, 0);
    if (visual && !slide.classList.contains("hero-slide")) {
      tl.fromTo(visual, { y: 36, scale: 1.04 }, { y: -36, scale: 1, ease: "none" }, 0);
    }
  });
}

function initKeys() {
  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;

    if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) {
      e.preventDefault();
      next();
    }
    if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
      e.preventDefault();
      prev();
    }
    if (e.key === "Home") {
      e.preventDefault();
      goTo(0);
    }
    if (e.key === "End") {
      e.preventDefault();
      goTo(TOTAL - 1);
    }
  });
}

function initClicks() {
  navDots.forEach((dot) => {
    dot.addEventListener("click", () => goTo(Number(dot.dataset.index)));
  });
  prevBtn?.addEventListener("click", prev);
  nextBtn?.addEventListener("click", next);
  document.getElementById("edgePrev")?.addEventListener("click", prev);
  document.getElementById("edgeNext")?.addEventListener("click", next);
  document.querySelector(".challenges-slide")?.addEventListener("click", (e) => {
    if (!e.target.closest(".card-go")) return;
    e.preventDefault();
    next();
  });

  document.getElementById("exploreCta")?.addEventListener("click", (e) => {
    e.preventDefault();
    goTo(1);
  });

  document.querySelector(".brand")?.addEventListener("click", (e) => {
    e.preventDefault();
    goTo(0);
  });

  document.querySelectorAll(".js-started").forEach((btn) => {
    btn.addEventListener("click", () => {
      toast.classList.add("is-on");
      window.setTimeout(() => toast.classList.remove("is-on"), 2600);
    });
  });
}

function initHistory() {
  window.addEventListener("popstate", () => {
    const i = parseHash();
    if (i !== index) goTo(i, { fromHash: true, force: true });
  });
}

function initParallax() {
  if (reduceMotion || isMobile()) return;

  window.addEventListener("mousemove", (e) => {
    const slide = slides[index];
    if (!slide) return;
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    const visual = slide.classList.contains("hero-slide")
      ? null
      : slide.querySelector(".hero-visual, .split-visual");
    const mid = slide.querySelector(".layer-mid");
    if (visual) gsap.to(visual, { x: x * -22, duration: 1, ease: "power3.out", overwrite: "auto" });
    if (mid) gsap.to(mid, { x: x * -30, duration: 0.9, ease: "power3.out", overwrite: "auto" });
    void y;
  });
}

function initTilt() {
  if (reduceMotion || isMobile()) return;
  document.querySelectorAll("[data-tilt]").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(card, {
        rotateY: x * 10,
        rotateX: -y * 10,
        duration: 0.4,
        transformPerspective: 900,
        ease: "power2.out",
      });
    });
    card.addEventListener("mouseleave", () => {
      gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.55, ease: "power3.out" });
    });
  });
}

function initMagnetic() {
  if (reduceMotion || isMobile()) return;
  document.querySelectorAll(".magnetic").forEach((btn) => {
    btn.addEventListener("mousemove", (e) => {
      const r = btn.getBoundingClientRect();
      gsap.to(btn, {
        x: (e.clientX - (r.left + r.width / 2)) * 0.22,
        y: (e.clientY - (r.top + r.height / 2)) * 0.22,
        duration: 0.3,
      });
    });
    btn.addEventListener("mouseleave", () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.4, ease: "power3.out" });
    });
  });
}

function initCursor() {
  if (isMobile() || reduceMotion) return;
  window.addEventListener("mousemove", (e) => {
    gsap.to(cursorDot, { x: e.clientX, y: e.clientY, duration: 0.05 });
    gsap.to(cursor, { x: e.clientX, y: e.clientY, duration: 0.25, ease: "power3.out" });
  });
  document.querySelectorAll("a, button, .challenge-card, .feature-card, .way-card, .why-card, .bento-card, .pill-card, .cta-card").forEach((el) => {
    el.addEventListener("mouseenter", () => cursor.classList.add("is-hover"));
    el.addEventListener("mouseleave", () => cursor.classList.remove("is-hover"));
  });
}

function boot() {
  window.setTimeout(() => {
    const leftover = document.getElementById("loader");
    if (leftover) leftover.remove();
    document.body.classList.add("loaded");
  }, 2400);

  wrapTitleWords();

  slides.forEach((slide, i) => {
    slide.classList.toggle("is-active", i === 0);
    slide.setAttribute("aria-hidden", i === 0 ? "false" : "true");
  });

  index = parseHash();
  updateChrome(index);
  setHash(index, true);

  try {
    initLenis();
    initScrollWatch();
    initChallengeWheel();
    initKeys();
    initClicks();
    initHistory();
    initParallax();
    initTilt();
    initMagnetic();
    initCursor();
  } catch (err) {
    console.error(err);
  }

  playLoader(() => {
    ScrollTrigger.refresh();
    snap?.resize();
    initScrollParallax();
    if (index > 0) {
      goTo(index, { fromHash: true, force: true, replace: true });
    } else {
      revealSlide(slides[index]);
    }
  });

  window.addEventListener("resize", () => {
    ScrollTrigger.refresh();
    snap?.resize();
    layoutAboutConnectors();
  });
}

boot();
