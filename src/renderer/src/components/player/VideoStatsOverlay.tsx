import React, { useEffect, useState, useRef } from 'react'
import { Activity, Monitor, Droplets, Info } from 'lucide-react'

interface VideoStatsOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>
}

export const VideoStatsOverlay: React.FC<VideoStatsOverlayProps> = ({ videoRef }) => {
  const [stats, setStats] = useState({
    fps: 0,
    droppedFrames: 0,
    totalFrames: 0,
    resolution: '0x0',
    viewport: '0x0'
  })
  
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const lastVideoFramesRef = useRef(0)

  useEffect(() => {
    let animationFrameId: number
    const updateStats = () => {
      const now = performance.now()
      frameCountRef.current++

      if (now - lastTimeRef.current >= 1000) {
        const displayFps = Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current))
        
        let videoFps = 0
        let dropped = 0
        let total = 0
        let res = '0x0'
        let view = '0x0'

        if (videoRef.current) {
          const video = videoRef.current
          const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null
          
          if (q) {
            const currentVideoFrames = q.totalVideoFrames
            const deltaFrames = currentVideoFrames - lastVideoFramesRef.current
            videoFps = Math.round((deltaFrames * 1000) / (now - lastTimeRef.current))
            
            lastVideoFramesRef.current = currentVideoFrames
            dropped = q.droppedVideoFrames
            total = q.totalVideoFrames
          }
          
          res = `${video.videoWidth}x${video.videoHeight}`
          view = `${video.clientWidth}x${video.clientHeight}`
        }

        frameCountRef.current = 0
        lastTimeRef.current = now

        setStats({
          fps: videoFps || displayFps, // Fallback to display FPS if video API is not available
          droppedFrames: dropped,
          totalFrames: total,
          resolution: res,
          viewport: view
        })
      }
      animationFrameId = requestAnimationFrame(updateStats)
    }

    animationFrameId = requestAnimationFrame(updateStats)
    return () => cancelAnimationFrame(animationFrameId)
  }, [videoRef])

  return (
    <div className="absolute top-4 left-4 z-40 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg p-3 text-white pointer-events-none w-64 shadow-2xl">
      <div className="flex items-center space-x-2 mb-2 border-b border-white/10 pb-2">
        <Activity size={14} className="text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-white/80">Stats for Nerds</span>
      </div>
      
      <div className="space-y-1.5 text-[11px] font-mono">
        <div className="flex justify-between items-center">
          <span className="text-white/50 flex items-center gap-1.5"><Monitor size={12}/> Resolution</span>
          <span className="font-semibold">{stats.resolution}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-white/50 flex items-center gap-1.5"><Info size={12}/> Viewport</span>
          <span className="font-semibold">{stats.viewport}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-white/50 flex items-center gap-1.5"><Activity size={12}/> FPS / Display</span>
          <span className="font-semibold text-emerald-400">{stats.fps} hz</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-white/50 flex items-center gap-1.5"><Droplets size={12}/> Dropped Frames</span>
          <span className="font-semibold text-rose-400">{stats.droppedFrames} / {stats.totalFrames}</span>
        </div>
      </div>
    </div>
  )
}
