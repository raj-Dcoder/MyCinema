import React, { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface HorizontalScrollRowProps {
  children: React.ReactNode
}

const HorizontalScrollRow: React.FC<HorizontalScrollRowProps> = ({ children }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const checkScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setShowLeft(scrollLeft > 2)
    setShowRight(scrollLeft < scrollWidth - clientWidth - 2)
  }, [])

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (el) el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)
    return () => {
      if (el) el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [children, checkScroll])

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const scrollAmount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    })
    setTimeout(checkScroll, 350)
  }

  return (
    <div
      className="relative -mx-8 px-8"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left scroll button */}
      <button
        onClick={() => scroll('left')}
        aria-label="Scroll left"
        style={{
          opacity: showLeft ? (isHovered ? 1 : 0.45) : 0,
          pointerEvents: showLeft ? 'auto' : 'none',
          transition: 'opacity 0.25s ease, transform 0.15s ease',
        }}
        className="scroll-nav-btn scroll-nav-btn--left"
      >
        <span className="scroll-nav-btn__track" />
        <ChevronLeft size={28} strokeWidth={2.5} className="scroll-nav-btn__icon" />
      </button>

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-4 pb-6 scrollbar-hide scroll-smooth"
      >
        {children}
      </div>

      {/* Right scroll button */}
      <button
        onClick={() => scroll('right')}
        aria-label="Scroll right"
        style={{
          opacity: showRight ? (isHovered ? 1 : 0.45) : 0,
          pointerEvents: showRight ? 'auto' : 'none',
          transition: 'opacity 0.25s ease, transform 0.15s ease',
        }}
        className="scroll-nav-btn scroll-nav-btn--right"
      >
        <span className="scroll-nav-btn__track" />
        <ChevronRight size={28} strokeWidth={2.5} className="scroll-nav-btn__icon" />
      </button>
    </div>
  )
}

export default HorizontalScrollRow
