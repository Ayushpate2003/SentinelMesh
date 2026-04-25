/**
 * Central GSAP + ScrollTrigger setup for the marketing landing page.
 * Run inside `gsap.context(() => setupLandingScrollAnimations(...), rootRef)` after `gsap.registerPlugin(ScrollTrigger)`.
 */

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

export type LandingScrollOptions = {
  reduceMotion: boolean
  narrow: boolean
}

export function setupLandingScrollAnimations(opts: LandingScrollOptions) {
  const { reduceMotion, narrow } = opts
  const lightMotion = reduceMotion || narrow

  const revealTargets = gsap.utils.toArray<HTMLElement>("[data-landing-reveal]")

  if (reduceMotion) {
    gsap.set(revealTargets, { autoAlpha: 1, y: 0, scale: 1 })
  } else {
    ScrollTrigger.batch(revealTargets, {
      interval: 0.14,
      batchMax: narrow ? 3 : 6,
      onEnter: (batch) => {
        gsap.fromTo(
          batch,
          { autoAlpha: 0, y: 40 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.82,
            stagger: { each: 0.08, from: "start" },
            ease: "power3.out",
            overwrite: "auto",
          },
        )
      },
      start: "top 90%",
      end: "top 35%",
    })
  }

  const footerReveal = document.querySelector<HTMLElement>("[data-landing-footer]")
  if (footerReveal) {
    if (reduceMotion) {
      gsap.set(footerReveal, { autoAlpha: 1, y: 0 })
    } else {
      gsap.fromTo(
        footerReveal,
        { autoAlpha: 0, y: 20 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: "power2.out",
          scrollTrigger: {
            trigger: footerReveal,
            start: "top 94%",
            toggleActions: "play none none none",
            once: true,
          },
        },
      )
    }
  }

  const pageGrid = document.querySelector<HTMLElement>("#landing-page-bg-grid")
  if (pageGrid && !lightMotion) {
    gsap.fromTo(
      pageGrid,
      { backgroundPosition: "0px 0px" },
      { backgroundPosition: "80px 80px", duration: 28, ease: "none", repeat: -1 },
    )
    gsap.to(pageGrid, {
      y: 90,
      ease: "none",
      scrollTrigger: {
        trigger: document.documentElement,
        start: "top top",
        end: "max max",
        scrub: 1.15,
      },
    })
  }

  const heroGrid = document.querySelector<HTMLElement>("#landing-hero-grid")
  if (heroGrid && !lightMotion) {
    gsap.fromTo(
      heroGrid,
      { backgroundPosition: "0px 0px" },
      { backgroundPosition: "96px 96px", duration: 22, ease: "none", repeat: -1 },
    )
  }

  const glow = document.querySelector<HTMLElement>("#landing-hero-glow")
  if (glow && !reduceMotion) {
    gsap.to(glow, {
      opacity: 0.28,
      scale: 1.05,
      duration: 3.2,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    })
  }

  const line = document.querySelector<HTMLElement>("#landing-hero-lines")
  if (line && !lightMotion) {
    gsap.fromTo(
      line,
      { opacity: 0.15, scaleX: 0.6 },
      { opacity: 0.55, scaleX: 1, duration: 1.8, ease: "power2.out", yoyo: true, repeat: -1 },
    )
  }

  const hero = document.querySelector<HTMLElement>("#landing-hero-inner")
  if (hero && glow && !reduceMotion) {
    gsap.to(glow, {
      y: 56,
      ease: "none",
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: 1.2,
      },
    })
  }

  if (!reduceMotion) {
    const parallaxEls = gsap.utils.toArray<HTMLElement>("[data-landing-parallax]")
    const yAmp = narrow ? 22 : 44
    parallaxEls.forEach((el) => {
      gsap.fromTo(
        el,
        { y: yAmp, force3D: true },
        {
          y: -yAmp,
          ease: "none",
          force3D: true,
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: 1.05,
          },
        },
      )
    })
  }
}
