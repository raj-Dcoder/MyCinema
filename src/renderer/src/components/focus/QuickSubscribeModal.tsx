import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, FolderPlus, Loader2, Plus, Sparkles, X } from 'lucide-react'
import type { FtCategory } from '../../types'
import { categoryDot } from '../../utils/focusTube'

interface QuickSubscribeModalProps {
  channel: {
    channelId: string
    title: string
    handle?: string | null
    avatarUrl?: string | null
  }
  categories: FtCategory[]
  onClose: () => void
  onSubscribed: (channelId: string) => void
  onCreateCategory?: (name: string) => Promise<FtCategory | null>
}

const QuickSubscribeModal: React.FC<QuickSubscribeModalProps> = ({
  channel,
  categories,
  onClose,
  onSubscribed,
  onCreateCategory,
}) => {
  const [subscribingId, setSubscribingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSelectCategory = async (catId: number) => {
    setSubscribingId(catId)
    setError(null)
    try {
      const res = await window.api.ftSubscribeChannel(
        {
          channelId: channel.channelId,
          title: channel.title,
          handle: channel.handle ?? null,
          avatarUrl: channel.avatarUrl ?? null,
        },
        [catId],
      )
      if (res && 'error' in res && res.error) {
        setError(res.error)
        setSubscribingId(null)
        return
      }
      onSubscribed(channel.channelId)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to subscribe')
      setSubscribingId(null)
    }
  }

  const handleCreateAndSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newCatName.trim()
    if (!trimmed || !onCreateCategory) return
    setCreatingCat(true)
    setError(null)
    try {
      const newCat = await onCreateCategory(trimmed)
      if (newCat) {
        await handleSelectCategory(newCat.id)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create category')
      setCreatingCat(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscribe-modal-title"
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/15 bg-[#0f1118] p-5 shadow-2xl shadow-black/80">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-3.5 top-3.5 rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X size={15} />
        </button>

        {/* Channel Info Header */}
        <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4 pr-6">
          {channel.avatarUrl && !avatarFailed ? (
            <img
              src={channel.avatarUrl}
              alt={channel.title}
              onError={() => setAvatarFailed(true)}
              className="h-11 w-11 shrink-0 rounded-full border border-white/10 object-cover shadow-md"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-800 text-sm font-black text-white shadow-md">
              {channel.title?.trim().charAt(0).toUpperCase() || '?'}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3
              id="subscribe-modal-title"
              className="truncate text-sm font-bold text-white leading-tight"
              title={channel.title}
            >
              {channel.title}
            </h3>
            <p className="truncate text-xs font-medium text-white/40 mt-0.5">
              {channel.handle ? `@${channel.handle.replace(/^@/, '')}` : 'Subscribe channel'}
            </p>
          </div>
        </div>

        {/* Instruction */}
        <div className="mt-3.5 mb-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-white/50">
            Select a category to subscribe
          </p>
        </div>

        {/* Categories List (1-Click Select) */}
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
          {categories.length > 0 ? (
            categories.map((cat) => {
              const isBusy = subscribingId === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  disabled={subscribingId !== null || creatingCat}
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all text-left group ${
                    isBusy
                      ? 'border-red-500/50 bg-red-600/20 text-white'
                      : 'border-white/5 bg-white/[0.04] text-white hover:border-red-500/40 hover:bg-red-600/15 hover:scale-[1.01] active:scale-[0.99]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoryDot(cat.color)}`} />
                    <span className="truncate text-xs font-bold text-white/90 group-hover:text-white">
                      {cat.name}
                    </span>
                  </div>
                  {isBusy ? (
                    <Loader2 size={14} className="animate-spin text-red-400 shrink-0" />
                  ) : (
                    <span className="text-[10px] font-medium text-white/30 group-hover:text-red-300 transition-colors shrink-0">
                      Select
                    </span>
                  )}
                </button>
              )
            })
          ) : (
            <p className="py-4 text-center text-xs text-white/40">
              No categories yet. Create one below to add channels!
            </p>
          )}
        </div>

        {/* Inline Create New Category */}
        <div className="mt-3 pt-3 border-t border-white/[0.08]">
          {showAddCat ? (
            <form onSubmit={handleCreateAndSubscribe} className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="New category name..."
                disabled={creatingCat}
                className="h-8 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newCatName.trim() || creatingCat}
                className="inline-flex h-8 items-center gap-1 rounded-xl bg-red-600 px-3 text-xs font-bold text-white shadow-md hover:bg-red-500 disabled:opacity-40"
              >
                {creatingCat ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddCat(false)}
                className="h-8 rounded-xl border border-white/10 px-2.5 text-xs text-white/50 hover:text-white"
              >
                Cancel
              </button>
            </form>
          ) : (
            onCreateCategory && (
              <button
                type="button"
                onClick={() => setShowAddCat(true)}
                className="inline-flex w-full items-center justify-center gap-1.5 py-1.5 rounded-xl border border-dashed border-white/15 text-xs font-semibold text-white/50 hover:text-white hover:border-white/30 hover:bg-white/[0.02] transition-colors"
              >
                <Plus size={12} /> Create new category
              </button>
            )
          )}
        </div>

        {error && (
          <p className="mt-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default QuickSubscribeModal
