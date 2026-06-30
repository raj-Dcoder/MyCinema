import React, { useState, useRef } from 'react'
import { X, Upload, Check, ImageIcon } from 'lucide-react'

// Import assets
import animeAvatar from '../assets/avatars/anime.png'
import clayAvatar from '../assets/avatars/clay.png'
import vectorAvatar from '../assets/avatars/vector.png'
import y2kAvatar from '../assets/avatars/y2k.png'

export const DEFAULT_AVATARS = [
  { id: 'anime', src: animeAvatar, label: 'Anime Cyberpunk' },
  { id: 'clay', src: clayAvatar, label: '3D Claymorphism' },
  { id: 'vector', src: vectorAvatar, label: 'Minimalist Vector' },
  { id: 'y2k', src: y2kAvatar, label: 'Y2K Retro' },
]

interface ProfilePictureModalProps {
  isOpen: boolean
  onClose: () => void
  currentImage: string | null
  onSelectImage: (imageUrl: string | null) => void
}

const ProfilePictureModal: React.FC<ProfilePictureModalProps> = ({ isOpen, onClose, currentImage, onSelectImage }) => {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const avatar = DEFAULT_AVATARS.find(a => a.src === currentImage)
    return avatar ? avatar.id : null
  })
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        onSelectImage(base64String)
        onClose()
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSelectAvatar = (avatar: typeof DEFAULT_AVATARS[0]) => {
    setSelectedId(avatar.id)
    onSelectImage(avatar.src)
    onClose()
  }

  const handleRemove = () => {
    onSelectImage(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0b1018] shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-5 bg-white/5">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <ImageIcon className="text-primary" size={24} />
            Choose Profile Picture
          </h2>
          <button 
            onClick={onClose}
            className="rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Custom Upload Button */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">Custom Photo</h3>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-white/10 bg-white/5 p-4 cursor-pointer hover:border-primary/50 hover:bg-primary/10 transition-all group"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary group-hover:scale-110 transition-transform">
                <Upload size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">Upload from device</p>
                <p className="text-xs text-white/50">PNG, JPG up to 5MB</p>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png, image/jpeg"
              className="hidden" 
            />
          </div>

          {/* Graphical Avatars */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">Gen-Z Avatars</h3>
            <div className="grid grid-cols-2 gap-4">
              {DEFAULT_AVATARS.map((avatar) => (
                <div 
                  key={avatar.id}
                  onClick={() => handleSelectAvatar(avatar)}
                  className={`relative cursor-pointer overflow-hidden rounded-2xl border-2 transition-all ${
                    currentImage === avatar.src || selectedId === avatar.id
                      ? 'border-primary shadow-[0_0_20px_rgba(59,130,246,0.3)]' 
                      : 'border-transparent hover:border-white/20'
                  }`}
                >
                  <img 
                    src={avatar.src} 
                    alt={avatar.label} 
                    className="w-full aspect-square object-cover hover:scale-105 transition-transform duration-300" 
                  />
                  {(currentImage === avatar.src || selectedId === avatar.id) && (
                    <div className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-lg">
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 pointer-events-none">
                    <p className="text-xs font-bold text-white truncate text-center">{avatar.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Remove Image */}
          {currentImage && (
            <div className="pt-2">
              <button 
                onClick={handleRemove}
                className="w-full rounded-xl p-3 text-sm font-bold text-red-400 hover:bg-red-400/10 transition-colors"
              >
                Remove Profile Picture
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default ProfilePictureModal
