import React, { useState, useEffect } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { LATEST_RELEASE } from './WhatsNewOnboarding'

interface InlineFeatureGuideProps {
  featureId: string
  targetVersion: string
  render: (dismiss: (e?: React.MouseEvent) => void) => React.ReactNode
}

export const InlineFeatureGuide: React.FC<InlineFeatureGuideProps> = ({ featureId, targetVersion, render }) => {
  const [show, setShow] = useState(false)
  
  const storageKey = `mycinema_feature_seen_${targetVersion}_${featureId}`

  useEffect(() => {
    // Only show if the current app release matches the target version for this feature.
    // This ensures old feature announcements don't appear for new users or across updates.
    if (LATEST_RELEASE.version === targetVersion) {
      const seen = localStorage.getItem(storageKey) === 'true'
      if (!seen) {
        setShow(true)
      }
    }
  }, [targetVersion, featureId, storageKey])

  const dismiss = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    localStorage.setItem(storageKey, 'true')
    setShow(false)
  }

  if (!show) return null

  return <>{render(dismiss)}</>
}

// ----------------------------------------------------------------------
// Specific Feature Spotlights
// ----------------------------------------------------------------------

interface WindowControlsGuideProps {
  launchFullscreen: boolean
  playingVideo: boolean
}

export const WindowControlsGuide: React.FC<WindowControlsGuideProps> = ({ launchFullscreen, playingVideo }) => {
  if (!launchFullscreen || playingVideo) return null

  return (
    <InlineFeatureGuide
      featureId="window-controls"
      targetVersion="1.27.0"
      render={(dismiss) => (
        <div
          className="fixed inset-0 z-[255] bg-black/45 backdrop-blur-[1.5px]"
          style={{
            background: 'radial-gradient(circle at calc(100% - 58px) 16px, transparent 0 42px, rgba(0,0,0,0.34) 70px, rgba(0,0,0,0.58) 100%)'
          }}
        >
          <button
            type="button"
            aria-label="Dismiss fullscreen controls tip"
            className="absolute inset-0 cursor-default"
            onClick={dismiss}
          />

          <div className="absolute right-8 top-12 w-[min(310px,calc(100vw-2rem))] rounded-lg border border-white/12 bg-[#080c12]/92 p-4 text-left shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
            <ArrowUpRight
              size={30}
              strokeWidth={1.8}
              className="absolute -right-1 -top-8 rotate-[-24deg] text-white/75 drop-shadow-[0_0_16px_rgba(255,255,255,0.25)]"
            />
            <div className="mb-2 inline-flex rounded-md border border-white/10 bg-white/6 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/55">
              New control
            </div>
            <h3 className="text-sm font-black uppercase tracking-tight text-white">
              Fullscreen controls moved here
            </h3>
            <p className="mt-2 text-xs font-semibold leading-5 text-white/55">
              Hover the top-right edge for quick minimize, fullscreen, and close controls.
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="mt-4 rounded-md border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-white/20 hover:text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    />
  )
}

export const ShareHintGuide: React.FC = () => {
  return (
    <InlineFeatureGuide
      featureId="detail-share-button"
      targetVersion="1.27.0"
      render={(dismiss) => (
        <div className="absolute left-1/2 top-full z-40 mt-3 w-[245px] -translate-x-1/2 rounded-xl border border-cyan-300/20 bg-[#07111c] p-3 text-left shadow-2xl shadow-black/45 ring-1 ring-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-cyan-300/20 bg-[#07111c]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-400">
                New Feature
              </p>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-white/60">
                Share this page directly with a rich preview link!
              </p>
            </div>
            <button
              onClick={dismiss}
              className="rounded-md p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white"
              title="Dismiss hint"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    />
  )
}

export const DownloadOptionsGuide: React.FC = () => {
  return (
    <InlineFeatureGuide
      featureId="download-options-menu"
      targetVersion="1.27.0"
      render={(dismiss) => (
        <div className="absolute right-0 top-full z-40 mt-3 w-[245px] rounded-xl border border-cyan-300/20 bg-[#07111c] p-3 text-left shadow-2xl shadow-black/45 ring-1 ring-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="absolute right-3 top-0 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-cyan-300/20 bg-[#07111c]" />
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-300/12 text-cyan-200">
              <ArrowUpRight size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">More Options</p>
              <p className="mt-1 text-[11px] font-semibold leading-relaxed text-white/58">
                Share source, remove from list, or delete from disk—all in one place.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white"
              title="Dismiss hint"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    />
  )
}
