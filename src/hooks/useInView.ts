import { useEffect, useRef, useState } from 'react'

/** Once true, stays true — used to lazy-mount below-the-fold tiles without
 *  unmounting/remounting (and re-fetching) them as they scroll in and out. */
export function useInView<T extends HTMLElement>(rootMargin = '200px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (inView) return
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true)
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [inView, rootMargin])

  return [ref, inView]
}
