import { useState, useEffect, useCallback, useRef } from 'react'

const AD_BAIT_CLASS = 'ad-placement'
const ADSENSE_SCRIPT_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'

function detectAdBlocker(): Promise<boolean> {
  return new Promise((resolve) => {
    const bait = document.createElement('div')
    bait.className = AD_BAIT_CLASS
    bait.style.cssText =
      'position:absolute;top:-999px;left:-999px;width:1px;height:1px;'
    document.body.appendChild(bait)

    requestAnimationFrame(() => {
      const blocked =
        bait.offsetHeight === 0 ||
        bait.offsetParent === null ||
        getComputedStyle(bait).display === 'none'
      bait.remove()
      resolve(blocked)
    })
  })
}

function loadAdSenseScript(clientId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src*="adsbygoogle"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = `${ADSENSE_SCRIPT_URL}?client=${clientId}`
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('AdSense script failed to load'))
    document.head.appendChild(script)
  })
}

export function useAd() {
  const [adBlocked, setAdBlocked] = useState(false)
  const [adLoaded, setAdLoaded] = useState(false)
  const detectionRan = useRef(false)

  useEffect(() => {
    if (detectionRan.current) return
    detectionRan.current = true

    // Respect cookie consent — don't load ad scripts if user declined
    const consent = localStorage.getItem('cw-cookie-consent')
    if (consent === 'rejected') {
      setAdBlocked(true)
      return
    }

    detectAdBlocker().then((blocked) => {
      setAdBlocked(blocked)
      if (!blocked) {
        const clientId = import.meta.env.VITE_AD_CLIENT_ID
        if (clientId) {
          loadAdSenseScript(clientId)
            .then(() => setAdLoaded(true))
            .catch(() => setAdBlocked(true))
        }
      }
    })
  }, [])

  const showAd = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (adBlocked || !adLoaded) {
        resolve(false)
        return
      }

      // Trigger AdSense vignette / interstitial
      // In production, this would use googletag.pubads() or adsbygoogle.push()
      // For now, simulate a short ad interaction
      try {
        const adsbygoogle = (window as any).adsbygoogle
        if (adsbygoogle) {
          adsbygoogle.push({})
        }
        // Give the ad a moment to render, then resolve
        setTimeout(() => resolve(true), 2000)
      } catch {
        resolve(false)
      }
    })
  }, [adBlocked, adLoaded])

  return { adBlocked, showAd, adLoaded }
}
