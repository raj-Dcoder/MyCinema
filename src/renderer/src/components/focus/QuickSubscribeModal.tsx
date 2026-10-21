import React, { useState } from 'react'
import { Check, FolderPlus, Loader2, Plus, Users, X } from 'lucide-react'
import type { FtCategory } from '../../types'

interface QuickSubscribeModalProps {
  channel: {
    channelId: string
    title: string
    handle?: string | null
    avatarUrl?: string | null
  }
  categories: FtCategory[]
  initialCategoryIds?: number[]
  onClose: () => void
  onSubscribed: () => void
  onCreateCategory?: (name: string) => Promise<FtCategory | null>
}

const QuickSubscribeModal: React.FC<QuickSubscribeModalProps> = ({
  channel,
  categories,
  initialCategoryIds = [],
  onClose,
  onSubscribed,
  onCreateCategory,
}) => {
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(() => {
    if (initialCategoryIds.length > 0) return initialCategoryIds
    if (categories.length > 0) return [categories[0].id]
    return []
  })
  const [newCatName, setNewCatName] = useState('')
  const [showAddCat, setShowAddCat] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)

  const toggleCategory = (id: number) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((catId) => catId !== id) : [...prev, id],
    )
  }

  const handleCreateNewCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newCatName.trim()
    if (!trimmed || !onCreateCategory) return
    try {
      const created = await onCreateCategory(trimmed)
      if (created) {
        setSelectedCategoryIds((prev) => [...prev, created.id])
        setNewCatName('')
        setShowAddCat(false)
      }
    } catch {
      // Ignore
    }
  }

  const handleConfirmSubscribe = async () => {
    setSubscribing(true)
    setError(null)
    try {
      const res = await window.api.ftSubscribeChannel(
        {
          channelId: channel.channelId,
          title: channel.title,
          handle: channel.handle ?? null,
          avatarUrl: channel.avatarUrl ?? null,
        },
        selectedCategoryIds,
      )
      if (res && 'error' in res && res.error) {
        setError(res.error)
        setSubscribing(false)
        return
      }
      onSubscribed()
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to subscribe')
      setSubscribing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0e1017] p-6 shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>

        {/* Channel Info Header */}
        <div className="flex items-center gap-4 border-b border-white/[0.08] pb-5">
          {channel.avatarUrl && !avatarFailed ? (
            <img
              src={channel.avatarUrl}
              alt={channel.title}
              onError={() => setAvatarFailed(true)}
              className="h-14 w-14 rounded-full border border-white/10 object-cover shadow-lg"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-800 text-lg font-black text-white shadow-lg">
              {channel.title?.trim().charAt(0).toUpperCase() || '?'}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-red-400">
              Subscribe to Channel
            </span>
            <h3 className="truncate text-base font-bold text-white" title={channel.title}>
              {channel.title}
            </h3>
            {channel.handle && (
              <p className="truncate text-xs font-medium text-white/40">
                @{channel.handle.replace(/^@/, '')}
              </p>
            )}
          </div>
        </div>

        {/* Category Assignment Section */}
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white/70">
              Assign to Categories
            </label>
            {onCreateCategory && !showAddCat && (
              <button
                type="button"
                onClick={() => setShowAddCat(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors"
              >
                <Plus size={12} /> New category
              </button>
            )}
          </div>

          {/* New Category Input */}
          {showAddCat && (
            <form onSubmit={handleCreateNewCategory} className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name (e.g. Reviews, Tech)"
                className="h-8 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newCatName.trim()}
                className="inline-flex h-8 items-center gap-1 rounded-xl bg-red-600 px-3 text-xs font-bold text-white disabled:opacity-40"
              >
                <Plus size={12} /> Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddCat(false)}
                className="h-8 rounded-xl border border-white/10 px-2.5 text-xs text-white/60 hover:text-white"
              >
                Cancel
              </button>
            </form>
          )}

          {/* Categories Grid/Pills */}
          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
            {categories.length > 0 ? (
              categories.map((cat) => {
                const isChecked = selectedCategoryIds.includes(cat.id)
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                      isChecked
                        ? 'border border-red-500/40 bg-red-600/15 text-white shadow-sm'
                        : 'border border-white/5 bg-white/[0.03] text-white/60 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    <span>{cat.name}</span>
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded-md border ${
                        isChecked
                          ? 'border-red-500 bg-red-600 text-white'
                          : 'border-white/20 bg-transparent'
                      }`}
                    >
                      {isChecked && <Check size={10} strokeWidth={3} />}
                    </div>
                  </button>
                )
              })
            ) : (
              <p className="py-2 text-center text-xs text-white/40">
                No categories yet. Add one above to organize your subscriptions!
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
              {error}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/5 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmSubscribe}
            disabled={subscribing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2 text-xs font-black text-white shadow-lg shadow-red-600/25 transition-all hover:bg-red-500 hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {subscribing ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Subscribing...
              </>
            ) : (
              <>
                <Plus size={13} strokeWidth={2.5} /> Confirm Subscribe
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuickSubscribeModal
