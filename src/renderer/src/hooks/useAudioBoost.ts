import { useEffect, useRef, useState } from 'react'

export type AudioBoostProfile = 'auto' | 'dialogue' | 'night' | 'laptop' | 'cinema'
export type AudioBoostIntensity = 'low' | 'medium' | 'high'

export const AUDIO_BOOST_PROFILES: Record<AudioBoostProfile, {
  label: string
  detail: string
  bassGain: number
  lowMidGain: number
  dialogGain: number
  presenceGain: number
  airGain: number
  compressorThreshold: number
  compressorKnee: number
  compressorRatio: number
  compressorAttack: number
  compressorRelease: number
  limiterThreshold: number
  outputGain: number
}> = {
  auto: {
    label: 'Auto',
    detail: 'Voices + leveler',
    bassGain: 2.8,
    lowMidGain: -2.8,
    dialogGain: 4.6,
    presenceGain: 2.2,
    airGain: 1.5,
    compressorThreshold: -30,
    compressorKnee: 22,
    compressorRatio: 5.2,
    compressorAttack: 0.006,
    compressorRelease: 0.22,
    limiterThreshold: -3.5,
    outputGain: 1.22
  },
  dialogue: {
    label: 'Dialogue',
    detail: 'Lift voices',
    bassGain: 0.8,
    lowMidGain: -4.2,
    dialogGain: 6.4,
    presenceGain: 3.4,
    airGain: 1.0,
    compressorThreshold: -31,
    compressorKnee: 20,
    compressorRatio: 4.8,
    compressorAttack: 0.005,
    compressorRelease: 0.18,
    limiterThreshold: -3.5,
    outputGain: 1.18
  },
  night: {
    label: 'Night',
    detail: 'Tame loud scenes',
    bassGain: -1.4,
    lowMidGain: -2.4,
    dialogGain: 5.4,
    presenceGain: 1.8,
    airGain: 0.8,
    compressorThreshold: -34,
    compressorKnee: 30,
    compressorRatio: 8.0,
    compressorAttack: 0.004,
    compressorRelease: 0.28,
    limiterThreshold: -6,
    outputGain: 1.14
  },
  laptop: {
    label: 'Laptop',
    detail: 'Small speakers',
    bassGain: 1.8,
    lowMidGain: -5.0,
    dialogGain: 5.4,
    presenceGain: 4.0,
    airGain: 2.0,
    compressorThreshold: -32,
    compressorKnee: 20,
    compressorRatio: 5.8,
    compressorAttack: 0.004,
    compressorRelease: 0.2,
    limiterThreshold: -3.8,
    outputGain: 1.26
  },
  cinema: {
    label: 'Cinema',
    detail: 'Bigger impact',
    bassGain: 5.4,
    lowMidGain: -1.8,
    dialogGain: 3.2,
    presenceGain: 1.6,
    airGain: 2.8,
    compressorThreshold: -26,
    compressorKnee: 22,
    compressorRatio: 4.0,
    compressorAttack: 0.008,
    compressorRelease: 0.2,
    limiterThreshold: -3,
    outputGain: 1.2
  }
}

export const AUDIO_BOOST_INTENSITIES: Record<AudioBoostIntensity, {
  label: string
  amount: number
  outputScale: number
}> = {
  low: { label: 'Low', amount: 0.72, outputScale: 0.82 },
  medium: { label: 'Med', amount: 1, outputScale: 1 },
  high: { label: 'High', amount: 1.28, outputScale: 1.12 }
}

interface UseAudioBoostProps {
  videoRef: React.RefObject<HTMLVideoElement>
  audioRef: React.RefObject<HTMLAudioElement>
  isPlaying: boolean
  selectedAudioId: string
  embeddedAudio: any[]
}

export function useAudioBoost({ videoRef, audioRef, isPlaying, selectedAudioId, embeddedAudio }: UseAudioBoostProps) {
  const [audioBoostEnabled, setAudioBoostEnabled] = useState(() => {
    return localStorage.getItem('mycinema_audio_boost') === 'true'
  })
  const [audioBoostProfile, setAudioBoostProfile] = useState<AudioBoostProfile>(() => {
    const stored = localStorage.getItem('mycinema_audio_boost_profile')
    if (stored === 'balanced') return 'auto'
    if (stored === 'rich') return 'cinema'
    if (stored === 'dialogue' || stored === 'night' || stored === 'laptop' || stored === 'cinema' || stored === 'auto') return stored as AudioBoostProfile
    return 'auto'
  })
  const [audioBoostIntensity, setAudioBoostIntensity] = useState<AudioBoostIntensity>(() => {
    const stored = localStorage.getItem('mycinema_audio_boost_intensity')
    return stored === 'low' || stored === 'high' ? stored : 'medium'
  })

  useEffect(() => {
    localStorage.setItem('mycinema_audio_boost', audioBoostEnabled.toString())
  }, [audioBoostEnabled])

  useEffect(() => {
    localStorage.setItem('mycinema_audio_boost_profile', audioBoostProfile)
  }, [audioBoostProfile])

  useEffect(() => {
    localStorage.setItem('mycinema_audio_boost_intensity', audioBoostIntensity)
  }, [audioBoostIntensity])

  const audioCtxRef = useRef<AudioContext | null>(null)
  const videoSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const audioSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const lowMidFilterRef = useRef<BiquadFilterNode | null>(null)
  const clarityFilterRef = useRef<BiquadFilterNode | null>(null)
  const presenceFilterRef = useRef<BiquadFilterNode | null>(null)
  const airFilterRef = useRef<BiquadFilterNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const limiterRef = useRef<DynamicsCompressorNode | null>(null)
  const boostGainRef = useRef<GainNode | null>(null)
  const audioBoostChainConnectedRef = useRef(false)

  const getActiveAudioChannelCount = () => {
    const fallback = embeddedAudio[0]?.channels || 2
    if (!selectedAudioId) return fallback

    const nativeMatch = selectedAudioId.match(/^nat-(\d+)$/)
    if (nativeMatch) {
      const nativeIndex = Number(nativeMatch[1])
      return embeddedAudio[nativeIndex]?.channels || fallback
    }

    const externalMatch = selectedAudioId.match(/^ext-(\d+)$/)
    if (externalMatch) {
      const streamIndex = Number(externalMatch[1])
      return embeddedAudio.find(track => track.index === streamIndex)?.channels || fallback
    }

    return fallback
  }

  useEffect(() => {
    const setParam = (param: AudioParam, value: number, time: number, ramp = 0.08) => {
      param.setTargetAtTime(value, time, ramp)
    }

    const initAudio = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
        }
        const ctx = audioCtxRef.current

        if (!bassFilterRef.current) {
          bassFilterRef.current = ctx.createBiquadFilter()
          bassFilterRef.current.type = 'lowshelf'
          bassFilterRef.current.frequency.value = 115
        }

        if (!lowMidFilterRef.current) {
          lowMidFilterRef.current = ctx.createBiquadFilter()
          lowMidFilterRef.current.type = 'peaking'
          lowMidFilterRef.current.frequency.value = 360
          lowMidFilterRef.current.Q.value = 1.05
        }
        
        if (!clarityFilterRef.current) {
          clarityFilterRef.current = ctx.createBiquadFilter()
          clarityFilterRef.current.type = 'peaking'
          clarityFilterRef.current.frequency.value = 1750
          clarityFilterRef.current.Q.value = 1.0
        }

        if (!presenceFilterRef.current) {
          presenceFilterRef.current = ctx.createBiquadFilter()
          presenceFilterRef.current.type = 'peaking'
          presenceFilterRef.current.frequency.value = 3400
          presenceFilterRef.current.Q.value = 1.2
        }

        if (!airFilterRef.current) {
          airFilterRef.current = ctx.createBiquadFilter()
          airFilterRef.current.type = 'highshelf'
          airFilterRef.current.frequency.value = 8500
        }

        if (!compressorRef.current) {
          compressorRef.current = ctx.createDynamicsCompressor()
          compressorRef.current.attack.value = 0.008
          compressorRef.current.release.value = 0.18
        }

        if (!limiterRef.current) {
          limiterRef.current = ctx.createDynamicsCompressor()
          limiterRef.current.threshold.value = -3
          limiterRef.current.knee.value = 0
          limiterRef.current.ratio.value = 14
          limiterRef.current.attack.value = 0.002
          limiterRef.current.release.value = 0.08
        }

        if (!boostGainRef.current) {
          boostGainRef.current = ctx.createGain()
        }

        if (videoRef.current && !videoSourceNodeRef.current) {
          videoSourceNodeRef.current = ctx.createMediaElementSource(videoRef.current)
          videoSourceNodeRef.current.connect(bassFilterRef.current)
        }

        if (audioRef.current && !audioSourceNodeRef.current) {
          audioSourceNodeRef.current = ctx.createMediaElementSource(audioRef.current)
          audioSourceNodeRef.current.connect(bassFilterRef.current)
        }

        if (!audioBoostChainConnectedRef.current) {
          bassFilterRef.current.connect(lowMidFilterRef.current)
          lowMidFilterRef.current.connect(clarityFilterRef.current)
          clarityFilterRef.current.connect(presenceFilterRef.current)
          presenceFilterRef.current.connect(airFilterRef.current)
          airFilterRef.current.connect(compressorRef.current)
          compressorRef.current.connect(limiterRef.current)
          limiterRef.current.connect(boostGainRef.current)
          boostGainRef.current.connect(ctx.destination)
          audioBoostChainConnectedRef.current = true
        }

        if (ctx.state === 'suspended') {
          ctx.resume()
        }
      } catch (e) {
        console.error('Audio Boost initialization failed:', e)
      }
    }

    if (isPlaying && audioBoostEnabled) {
      initAudio()
    }

    if (audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime
      const profile = AUDIO_BOOST_PROFILES[audioBoostProfile]
      const intensity = AUDIO_BOOST_INTENSITIES[audioBoostIntensity]
      const active = audioBoostEnabled
      const intensityAmount = active ? intensity.amount : 0
      const channelCount = getActiveAudioChannelCount()
      const surroundDialogLift = active && channelCount >= 6 ? 1.18 : 1
      const scaledGain = (value: number) => value * intensityAmount
      const scaledOutputGain = active
        ? 1 + ((profile.outputGain - 1) * intensity.outputScale) + (channelCount >= 6 ? 0.04 : 0)
        : 1.0
      const scaledThreshold = active
        ? profile.compressorThreshold + ((1 - intensity.amount) * 8)
        : 0

      if (bassFilterRef.current) {
        setParam(bassFilterRef.current.gain, scaledGain(profile.bassGain), now)
      }
      if (lowMidFilterRef.current) {
        setParam(lowMidFilterRef.current.gain, scaledGain(profile.lowMidGain), now)
      }
      if (clarityFilterRef.current) {
        setParam(clarityFilterRef.current.gain, scaledGain(profile.dialogGain * surroundDialogLift), now)
      }
      if (presenceFilterRef.current) {
        setParam(presenceFilterRef.current.gain, scaledGain(profile.presenceGain * surroundDialogLift), now)
      }
      if (airFilterRef.current) {
        setParam(airFilterRef.current.gain, scaledGain(profile.airGain), now)
      }
      if (compressorRef.current) {
        setParam(compressorRef.current.threshold, scaledThreshold, now)
        setParam(compressorRef.current.knee, active ? profile.compressorKnee : 0, now)
        setParam(compressorRef.current.ratio, active ? 1 + ((profile.compressorRatio - 1) * intensity.amount) : 1, now)
        setParam(compressorRef.current.attack, active ? profile.compressorAttack : 0.003, now)
        setParam(compressorRef.current.release, active ? profile.compressorRelease : 0.25, now)
      }
      if (limiterRef.current) {
        setParam(limiterRef.current.threshold, active ? profile.limiterThreshold : 0, now)
        setParam(limiterRef.current.ratio, active ? 14 : 1, now)
      }
      if (boostGainRef.current) {
        setParam(boostGainRef.current.gain, scaledOutputGain, now)
      }
    }

    return () => {
      if (audioCtxRef.current && !isPlaying) {
        audioCtxRef.current.suspend()
      }
    }
  }, [audioBoostEnabled, audioBoostProfile, audioBoostIntensity, isPlaying, selectedAudioId, embeddedAudio, videoRef, audioRef])

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
    }
  }, [])

  return {
    audioBoostEnabled,
    setAudioBoostEnabled,
    audioBoostProfile,
    setAudioBoostProfile,
    audioBoostIntensity,
    setAudioBoostIntensity,
    audioCtxRef
  }
}
