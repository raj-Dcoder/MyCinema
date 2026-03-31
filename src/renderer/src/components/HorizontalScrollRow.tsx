import React, { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface HorizontalScrollRowProps {
  children: React.ReactNode
}

const HorizontalScrollRow: React.FC<HorizontalScrollRowProps> = ({ children }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)

  const checkScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setShowLeft(scrollLeft > 2)
    setShowRight(scrollLeft < scrollWidth - clientWidth - 2)
  }

  useEffect(() => {
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [children])

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.75
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
      setTimeout(checkScroll, 300)
    }
  }

  return (
    <div className="relative group/row -mx-8 px-8">
      {showLeft && (
        <button 
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-6 z-10 w-24 bg-gradient-to-r from-background via-background/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center justify-start pl-2 text-white hover:text-primary cursor-pointer"
        >
          <ChevronLeft size={48} className="stroke-[3px] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)] hover:scale-110 transition-transform" />
        </button>
      )}
      
      <div 
        ref={scrollRef} 
        onScroll={checkScroll}
        className="flex overflow-x-auto gap-4 pb-6 scrollbar-hide scroll-smooth"
      >
        {children}
      </div>

      {showRight && (
        <button 
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-6 z-10 w-24 bg-gradient-to-l from-background via-background/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center justify-end pr-2 text-white hover:text-primary cursor-pointer"
        >
          <ChevronRight size={48} className="stroke-[3px] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)] hover:scale-110 transition-transform" />
        </button>
      )}
    </div>
  )
}

export default HorizontalScrollRow
