import React from 'react'

export interface FocusTubeIconProps {
  size?: number
  className?: string
  /**
   * 'auto': Uses compact play+laser for small sizes (<=22px) and full wireframe for larger sizes
   * 'wireframe': Always renders full YouTube screen with perspective wireframe lines and laser dot
   * 'compact': Always renders clean play triangle with glowing red laser focus dot (as shown in 20px preview)
   */
  variant?: 'auto' | 'wireframe' | 'compact'
  /** Whether to animate or pulse the red laser dot slightly */
  pulse?: boolean
}

export const FocusTubeIcon: React.FC<FocusTubeIconProps> = ({
  size = 22,
  className = '',
  variant = 'auto',
  pulse = false
}) => {
  const isCompact = variant === 'compact' || (variant === 'auto' && size <= 22)

  // Unique ID prefix for SVG gradients/filters in case multiple icons are mounted
  const filterId = React.useId().replace(/:/g, '')

  if (isCompact) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 overflow-visible ${className}`}
        aria-label="FocusTube"
      >
        <defs>
          <filter id={`laser-glow-${filterId}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id={`dot-radial-${filterId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff4d6d" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#ff0033" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ff0033" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer bold YouTube screen boundary - well-balanced to fill 24x24 box */}
        <rect
          x="1.5"
          y="3.5"
          width="21"
          height="17"
          rx="4.8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.45"
        />

        {/* Clean Play Triangle Outline */}
        <polygon
          points="9 7.2, 17 12, 9 16.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />

        {/* Subtle Horizontal Laser Streak from left to play triangle */}
        <line
          x1="1.5"
          y1="12"
          x2="9"
          y2="12"
          stroke="#ff1e42"
          strokeWidth="1.4"
          strokeOpacity="0.85"
          strokeLinecap="round"
        />

        {/* Glowing Red Laser Focus Halo */}
        <circle
          cx="9"
          cy="12"
          r="3.5"
          fill={`url(#dot-radial-${filterId})`}
          className={pulse ? 'animate-pulse' : ''}
        />

        {/* Sharp Hot Red Laser Focus Dot on Play edge */}
        <circle
          cx="9"
          cy="12"
          r="1.5"
          fill="#ff1744"
          filter={`url(#laser-glow-${filterId})`}
        />
        {/* Specular White Core */}
        <circle cx="9" cy="12" r="0.7" fill="#ffffff" />
      </svg>
    )
  }

  // Full Wireframe Variant (For Header badge or larger displays)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 overflow-visible ${className}`}
      aria-label="FocusTube"
    >
      <defs>
        <filter id={`laser-glow-lg-${filterId}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`dot-radial-lg-${filterId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff4d6d" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#ff003b" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ff003b" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer Curved YouTube Screen */}
      <rect
        x="2"
        y="4.5"
        width="28"
        height="23"
        rx="6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeOpacity="0.65"
      />

      {/* 4 Inward 3D Perspective Wireframe Lines */}
      <line
        x1="4.5"
        y1="6.5"
        x2="12"
        y2="10.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeOpacity="0.35"
      />
      <line
        x1="4.5"
        y1="25.5"
        x2="12"
        y2="21.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeOpacity="0.35"
      />
      <line
        x1="27.5"
        y1="6.5"
        x2="22"
        y2="16"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeOpacity="0.35"
      />
      <line
        x1="27.5"
        y1="25.5"
        x2="22"
        y2="16"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeOpacity="0.35"
      />

      {/* Central Play Triangle Wireframe */}
      <polygon
        points="12 10.5, 22 16, 12 21.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />

      {/* Horizontal Red Laser Streak */}
      <line
        x1="2"
        y1="16"
        x2="12"
        y2="16"
        stroke="#ff1e42"
        strokeWidth="1.6"
        strokeOpacity="0.9"
        strokeLinecap="round"
      />

      {/* Radiant Glow Behind Laser Dot */}
      <circle
        cx="12"
        cy="16"
        r="5"
        fill={`url(#dot-radial-lg-${filterId})`}
        className={pulse ? 'animate-pulse' : ''}
      />

      {/* High-Intensity Laser Focus Dot */}
      <circle
        cx="12"
        cy="16"
        r="2.2"
        fill="#ff1744"
        filter={`url(#laser-glow-lg-${filterId})`}
      />

      {/* Specular White Core */}
      <circle cx="12" cy="16" r="0.9" fill="#ffffff" />
    </svg>
  )
}

export default FocusTubeIcon
