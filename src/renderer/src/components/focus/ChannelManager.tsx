import React, { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Plus, Trash2, X } from 'lucide-react'
import type { FtCategory, FtChannel } from '../../types'
import { formatRelativeTime } from '../../utils/focusTube'

interface ChannelManagerProps {
  categories: FtCategory[]
  initialCategoryId: number | null
  onClose: () => void
  onChanged: () => void
}

/**
 * Subscription management. Channels are the only thing the user curates
 * directly; categories are how those channels are filed for the stack.
 */
const ChannelManager: React.FC<ChannelManagerProps> = ({ categories, initialCategoryId, onClose, onChanged }) => {
  const [channels, setChannels] = useState<FtChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const list = (await window.api.ftListChannels(null)) || []
    setChannels(list)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleAdd = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    setAdding(true)
    setAddError(null)
    try {
      const targetCategoryId = initialCategoryId ?? categories[0]?.id ?? null
      const result: any = await window.api.ftAddChannel(trimmed, targetCategoryId ? [targetCategoryId] : [])
      if (result?.error) {
        setAddError(result.error)
        return
      }
      setQuery('')
      await load()
      onChanged()
    } catch (err: any) {
      setAddError(err?.message || 'Could not add that channel')
    } finally {
      setAdding(false)
    }
  }, [query, initialCategoryId, categories, load, onChanged])

  const handleRemove = useCallback(async (channelId: string) => {
    await window.api.ftDeleteChannel(channelId)
    await load()
    onChanged()
  }, [load, onChanged])

  const toggleCategory = useCallback(async (channelId: string, categoryId: number, currentlyIn: boolean) => {
    const channel = channels.find((c) => c.channelId === channelId)
    if (!channel) return
    const next = currentlyIn
      ? channel.categoryIds.filter((id) => id !== categoryId)
      : [...channel.categoryIds, categoryId]
    await window.api.ftSetChannelCategories(channelId, next)
    await load()
    onChanged()
  }, [channels, load, onChanged])

  return (
    <div className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-black/80 p-8 pt-20">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h3 className="text-lg font-black uppercase italic text-white">Your channels</h3>
            <p className="text-xs font-semibold text-white/35">
              Focus Tube only shows uploads from channels you subscribe to here
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close channel manager"
            className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-white/10 px-6 py-4">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void handleAdd() }}
              placeholder="@handle, channel URL, or a video link"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-white/25 focus:border-primary/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding || !query.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Subscribe
            </button>
          </div>
          {addError && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <AlertCircle size={13} /> {addError}
            </p>
          )}
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="py-8 text-center text-xs font-bold uppercase tracking-widest text-white/25">Loading</p>
          ) : channels.length === 0 ? (
            <div className="py-10 text-center opacity-30">
              <p className="text-sm font-black uppercase italic">No channels yet</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest">Subscribe above to build your stack</p>
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((channel) => {
                const isEditing = editingId === channel.channelId
                return (
                  <div key={channel.channelId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center gap-3">
                      {channel.avatarUrl ? (
                        <img
                          src={channel.avatarUrl}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                          onError={(event) => { event.currentTarget.style.visibility = 'hidden' }}
                        />
                      ) : (
                        <div className="h-9 w-9 shrink-0 rounded-full bg-white/10" />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{channel.title}</p>
                        <p className="text-[11px] font-semibold text-white/30">
                          {channel.handle || channel.channelId}
                          {channel.lastFetched && ` · updated ${formatRelativeTime(channel.lastFetched)}`}
                          {channel.lastError && ' · feed error'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditingId(isEditing ? null : channel.channelId)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white"
                      >
                        {isEditing ? 'Done' : 'Categories'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemove(channel.channelId)}
                        aria-label={`Unsubscribe from ${channel.title}`}
                        className="rounded-lg p-2 text-white/25 hover:bg-red-500/15 hover:text-red-400"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {channel.lastError && (
                      <p className="mt-2 text-[11px] font-semibold text-amber-500/80">
                        Last refresh failed ({channel.lastError}) — showing the last good copy
                      </p>
                    )}

                    {isEditing && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                        {categories.map((category) => {
                          const active = channel.categoryIds.includes(category.id)
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => void toggleCategory(channel.channelId, category.id, active)}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                                active
                                  ? 'border-primary bg-primary/20 text-white'
                                  : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {active && <Check size={11} />}
                              {category.name}
                            </button>
                          )
                        })}
                        {categories.length === 0 && (
                          <span className="text-[11px] font-semibold text-white/30">Create a category first</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChannelManager
