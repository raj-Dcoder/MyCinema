import React from 'react'

const pillBase =
  'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] backdrop-blur-md transition-all'

const labelClass = 'leading-none text-[#F4EEE6] drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]'

// Calendar with a play button — the NEW EPISODE mark.
const NewEpisodeIcon: React.FC<{ size?: number }> = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="5.5" width="18" height="15.5" rx="3.5" fill="#F7E9E6" />
    <path d="M3 9.5C3 7.5 4.6 6 6.5 6h11C19.4 6 21 7.5 21 9.5V10H3V9.5Z" fill="#E23A3A" />
    <rect x="7" y="3" width="2.6" height="5" rx="1.3" fill="#F7E9E6" />
    <rect x="14.4" y="3" width="2.6" height="5" rx="1.3" fill="#F7E9E6" />
    <path d="M10.4 12.6v5.2c0 .8.9 1.3 1.6.9l4-2.6c.6-.4.6-1.4 0-1.8l-4-2.6c-.7-.4-1.6.1-1.6.9Z" fill="#E23A3A" />
  </svg>
)

// Radiating wifi arcs — the ONLINE mark.
const OnlineIcon: React.FC<{ size?: number }> = ({ size = 17 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{ filter: 'drop-shadow(0 0 6px rgba(43,227,107,0.65))' }}
  >
    <path d="M4 9.5C7.5 6.2 11 5 12 5s4.5 1.2 8 4.5" stroke="#2BE36B" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M7 13c2.2-2.3 4-3 5-3s2.8.7 5 3" stroke="#2BE36B" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="12" cy="17.4" r="2.1" fill="#2BE36B" />
  </svg>
)

// Play triangle + stop bar — the NEXT EPISODE mark.
const NextEpisodeIcon: React.FC<{ size?: number }> = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 5.8v12.4c0 1 1.1 1.6 2 1.1l8.6-6.2c.8-.6.8-1.8 0-2.4L8 4.7c-.9-.5-2 .1-2 1.1Z" fill="#C9C1F2" />
    <rect x="17.4" y="5" width="2.8" height="14" rx="1.4" fill="#C9C1F2" />
  </svg>
)

export const NewEpisodeBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`${pillBase} bg-gradient-to-b from-[#8E1616] to-[#6E0E0E] text-white shadow-[0_10px_28px_rgba(200,30,30,0.4)] ring-1 ring-[#FF6B5E]/30 ${className}`}
  >
    <NewEpisodeIcon />
    <span className={labelClass}>New Episode</span>
  </span>
)

export const OnlineBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`${pillBase} bg-gradient-to-b from-[#0C4A30] to-[#07351F] text-white shadow-[0_10px_28px_rgba(20,120,70,0.35)] ring-1 ring-[#2BE36B]/25 ${className}`}
  >
    <OnlineIcon />
    <span className={labelClass}>Online</span>
  </span>
)

export const NextEpisodeBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`${pillBase} bg-gradient-to-b from-[#26225E] to-[#181545] text-white shadow-[0_10px_28px_rgba(80,70,180,0.4)] ring-1 ring-[#8F86E8]/30 ${className}`}
  >
    <NextEpisodeIcon />
    <span className={labelClass}>Next Episode</span>
  </span>
)
