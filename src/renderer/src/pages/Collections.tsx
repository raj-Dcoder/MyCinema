import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Video } from '../types'
import VideoCard from '../components/VideoCard'
import {
  ArrowLeft, Check, Copy, FileDown, FolderOpen, Layers, MessageCircle, Pencil, Pin, PinOff, Plus,
  Search, Send, Share2, Sparkles, Trash2, Upload, X,
} from 'lucide-react'

interface CollectionsProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
  focusCollectionId?: number | null
  focusNonce?: number
}

interface Collection {
  id: number
  key: string | null
  name: string
  description: string | null
  rules: any
  is_smart: number
  sort_4k_first: number
  memberCount?: number
  preview?: Array<string | null>
}

const CARD_GRADIENTS = [
  'from-violet-600/80 via-purple-600/60 to-fuchsia-700/70',
  'from-amber-500/80 via-orange-600/60 to-rose-700/70',
  'from-emerald-500/80 via-teal-600/60 to-cyan-700/70',
  'from-sky-500/80 via-blue-600/60 to-indigo-700/70',
  'from-rose-500/80 via-pink-600/60 to-purple-700/70',
]

const resolvePoster = (path?: string | null) => {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `media://file/${encodeURIComponent(path)}`
}

const inputCls =
  'h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm font-bold text-white outline-none transition-all placeholder:text-white/28 focus:border-primary/45 focus:ring-1 focus:ring-primary/35'

const Collections: React.FC<CollectionsProps> = ({ onPlay, onShowDetail, focusCollectionId = null, focusNonce = 0 }) => {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [members, setMembers] = useState<Video[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState<Collection | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<Collection | null>(null)
  const noticeTimer = useRef<number | null>(null)

  const flash = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4200)
  }, [])

  const fetchCollections = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await window.api.getCollections()
      setCollections(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load collections:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMembers = useCallback(async (collectionId: number) => {
    setMembersLoading(true)
    try {
      const data = await window.api.getCollectionMembers(collectionId)
      setMembers(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load collection members:', err)
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCollections(true)
  }, [fetchCollections])

  useEffect(() => {
    return window.api.onLibraryUpdated(() => {
      fetchCollections(false)
      if (selectedId != null) fetchMembers(selectedId)
    })
  }, [fetchCollections, fetchMembers, selectedId])

  useEffect(() => {
    if (selectedId != null) fetchMembers(selectedId)
    else setMembers([])
  }, [selectedId, fetchMembers])

  // Deep-link focus: opening a shared collection link selects it.
  useEffect(() => {
    if (focusNonce > 0 && focusCollectionId != null) {
      fetchCollections(false)
      setSelectedId(focusCollectionId)
    }
  }, [focusCollectionId, focusNonce, fetchCollections])

  const selected = useMemo(
    () => collections.find((c) => c.id === selectedId) || null,
    [collections, selectedId],
  )

  // ── Press-and-hold drag-to-reorder ───────────────────────────────────────
  // Touch: hold ~450ms (scroll still works until then), then drag.
  // Mouse: drag starts after a small move. Double-tap-hold works the same.
  const cardRefs = useRef(new Map<number, HTMLDivElement>())
  const [dragId, setDragId] = useState<number | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const latestPoint = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const rectCache = useRef(new Map<number, { cx: number; cy: number; w: number; h: number }>())
  const rectsDirty = useRef(true)
  const pressRef = useRef<{ id: number; x: number; y: number; pointerId: number; element: HTMLDivElement } | null>(null)
  const pressTimer = useRef<number | null>(null)
  const dragIdRef = useRef<number | null>(null)
  const collectionsRef = useRef<Collection[]>(collections)
  collectionsRef.current = collections
  const dragStartOrder = useRef<number[]>([])
  const orderChangedRef = useRef(false)
  const suppressClick = useRef(false)

  const clearPressTimer = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const cancelReorderRaf = () => {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const positionGhost = (x: number, y: number) => {
    const ghost = ghostRef.current
    if (ghost) {
      ghost.style.transform = `translate(${x - 120}px, ${y - 36}px) rotate(2deg) scale(1.04)`
    }
  }

  const refreshRectCache = () => {
    rectCache.current.clear()
    cardRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect()
      rectCache.current.set(id, {
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        w: rect.width,
        h: rect.height,
      })
    })
  }

  const activateDrag = (pointerId: number) => {
    const press = pressRef.current
    if (!press || dragIdRef.current != null) return
    dragIdRef.current = press.id
    dragStartOrder.current = collectionsRef.current.map((c) => c.id)
    orderChangedRef.current = false
    try {
      press.element.setPointerCapture(pointerId)
    } catch { /* noop */ }
    try {
      (navigator as any).vibrate?.(25)
    } catch { /* noop */ }
    rectsDirty.current = true
    latestPoint.current = { x: press.x, y: press.y }
    setDragId(press.id)
  }

  const computeInsertionIndex = (x: number, y: number, excludeId: number): number => {
    const order = collectionsRef.current.map((c) => c.id).filter((id) => id !== excludeId)
    let index = 0
    for (const id of order) {
      const cached = rectCache.current.get(id)
      if (!cached) {
        index += 1
        continue
      }
      const sameRow = Math.abs(y - cached.cy) <= cached.h / 2
      if (y > cached.cy + cached.h * 0.2 || (sameRow && x > cached.cx)) {
        index += 1
      } else {
        break
      }
    }
    return Math.max(0, Math.min(order.length, index))
  }

  const runReorderPass = () => {
    rafRef.current = null
    const pt = latestPoint.current
    const draggedId = dragIdRef.current
    if (!pt || draggedId == null) return
    if (rectsDirty.current) {
      refreshRectCache()
      rectsDirty.current = false
    }
    const others = collectionsRef.current.map((c) => c.id).filter((id) => id !== draggedId)
    const index = computeInsertionIndex(pt.x, pt.y, draggedId)
    const next = [...others.slice(0, index), draggedId, ...others.slice(index)]
    const prev = collectionsRef.current.map((c) => c.id)
    if (next.some((id, i) => id !== prev[i])) {
      orderChangedRef.current = true
      const byId = new Map(collectionsRef.current.map((c) => [c.id, c]))
      setCollections(next.map((id) => byId.get(id)!).filter(Boolean))
      // DOM reflows after commit — re-measure before the next computation.
      rectsDirty.current = true
    }
  }

  const scheduleReorderPass = () => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(runReorderPass)
  }

  const onCardPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: number) => {
    if (!e.isPrimary) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pressRef.current = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, element: e.currentTarget }
    if (e.pointerType !== 'mouse') {
      clearPressTimer()
      pressTimer.current = window.setTimeout(() => activateDrag(e.pointerId), 450)
    }
  }

  const onCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current
    if (!press || e.pointerId !== press.pointerId) return
    const dx = e.clientX - press.x
    const dy = e.clientY - press.y
    const dist = Math.hypot(dx, dy)

    if (dragIdRef.current == null) {
      if (e.pointerType === 'mouse') {
        if (dist < 8) return
        activateDrag(e.pointerId)
      } else {
        // Touch moving before hold completes = scrolling, abort the pickup.
        if (dist > 12) {
          clearPressTimer()
          pressRef.current = null
        }
        return
      }
    }

    if (dragIdRef.current == null) return
    if (dist > 10) suppressClick.current = true
    // Hot path: move the ghost imperatively (no re-render), coalesce the
    // reorder computation to one pass per animation frame.
    latestPoint.current = { x: e.clientX, y: e.clientY }
    positionGhost(e.clientX, e.clientY)
    scheduleReorderPass()
  }

  const endDrag = (persist: boolean) => {
    clearPressTimer()
    cancelReorderRaf()
    const wasDragging = dragIdRef.current != null
    pressRef.current = null
    dragIdRef.current = null
    latestPoint.current = null
    setDragId(null)
    if (wasDragging && persist && orderChangedRef.current) {
      const ids = collectionsRef.current.map((c) => c.id)
      window.api.reorderCollections(ids).catch((err) => console.error('[Collections] Reorder failed:', err))
    }
    orderChangedRef.current = false
    // A drop is often followed by a click from the same gesture — let that one
    // be suppressed, then re-arm clicks so a stale flag never eats a real tap.
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  // Window-level release listeners: pointer capture + live re-renders can
  // retarget the release away from the card, leaving the drag stuck. The
  // window always sees the release.
  useEffect(() => {
    if (dragId == null) return
    const finish = () => endDrag(true)
    const markRectsDirty = () => {
      rectsDirty.current = true
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('scroll', markRectsDirty, true)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('scroll', markRectsDirty, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  // Place the ghost under the finger as soon as it mounts (its position is
  // then driven imperatively, outside React renders).
  useEffect(() => {
    if (dragId == null) return
    const press = pressRef.current
    if (press) positionGhost(press.x, press.y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  const openCreate = () => {
    setEditing(null)
    setBuilderOpen(true)
  }

  const openEdit = (collection: Collection) => {
    setEditing(collection)
    setBuilderOpen(true)
  }

  const handleDelete = async (collection: Collection) => {
    if (!window.confirm(`Delete "${collection.name}"? This cannot be undone.`)) return
    try {
      await window.api.deleteCollection(collection.id)
      if (selectedId === collection.id) setSelectedId(null)
      flash(`Deleted "${collection.name}"`)
    } catch (err) {
      console.error(err)
      flash('Delete failed')
    }
  }

  const handleImport = async () => {
    try {
      const result = await window.api.importCollection()
      if (result?.imported) {
        const online = result.addedOnline ?? 0
        flash(`Imported collection — ${result.matched ?? 0} in your library${online ? `, ${online} added as online titles` : ''}`)
        fetchCollections(false)
      } else if (!result?.canceled) {
        flash(`Import failed: ${result?.error || 'invalid file'}`)
      }
    } catch (err) {
      console.error(err)
      flash('Import failed')
    }
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selected) {
    const onlineCount = members.filter((m) => m.isExternal).length
    const localCount = members.length - onlineCount
    const handleRemoveExternal = async (video: Video) => {
      const externalId = (video as any).collection_external_id
      if (externalId == null) return
      try {
        await window.api.removeCollectionExternal(externalId)
        fetchMembers(selected.id)
        fetchCollections(false)
      } catch (err) {
        console.error(err)
        flash('Remove failed')
      }
    }
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedId(null)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-white/60 transition-colors hover:text-white"
              title="Back to collections"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 className="text-3xl font-black text-white tracking-tighter">{selected.name}</h2>
              {selected.description && <p className="mt-1 max-w-2xl text-sm font-bold text-white/40">{selected.description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setPickerOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-black text-white/70 hover:text-white" title="Add titles to this collection">
              <Pin size={14} /> ADD TITLES
            </button>
            <button onClick={() => openEdit(selected)} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-black text-white/70 hover:text-white" title="Edit name and description">
              <Pencil size={14} /> EDIT
            </button>
            <button onClick={() => setShareTarget(selected)} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-black text-white/70 hover:text-white" title="Share to apps or as a file">
              <Share2 size={14} /> SHARE
            </button>
            <button onClick={() => handleDelete(selected)} className="flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 text-xs font-black text-red-400 hover:bg-red-500/20">
              <Trash2 size={14} /> DELETE
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm font-bold text-white">{notice}</div>
        )}

        {membersLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
            <Layers size={36} className="text-white/20" />
            <p className="text-lg font-black text-white">This collection is empty</p>
            <p className="max-w-md text-sm font-bold text-white/40">
              Add titles from your library or search any movie or show online with ADD TITLES — or import a shared collection file.
            </p>
            <button onClick={() => openEdit(selected)} className="mt-2 flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white hover:opacity-90">
              <Pencil size={14} /> EDIT COLLECTION
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/30">
              {members.length} title{members.length === 1 ? '' : 's'}
              {onlineCount > 0 && <span> · {localCount} in library · {onlineCount} online</span>}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {members.map((video) => (
                <VideoCard
                  key={video.isExternal ? `ext-${video.id}` : video.id}
                  video={video}
                  onPlay={onPlay}
                  onShowDetail={onShowDetail}
                  compactTopBar={video.isExternal}
                  onRemove={video.isExternal ? () => handleRemoveExternal(video) : undefined}
                />
              ))}
            </div>
          </>
        )}

        {builderOpen && (
          <CollectionEditor
            initial={editing}
            onClose={() => setBuilderOpen(false)}
            onSaved={(saved) => {
              setBuilderOpen(false)
              setSelectedId(saved.id)
              fetchCollections(false)
              fetchMembers(saved.id)
              flash(`Saved "${saved.name}"`)
            }}
            flash={flash}
          />
        )}
        {shareTarget && (
          <ShareModal
            collection={shareTarget}
            onClose={() => setShareTarget(null)}
            flash={flash}
          />
        )}
        {pickerOpen && (
          <TitlePicker
            collection={selected}
            onClose={() => {
              setPickerOpen(false)
              fetchMembers(selected.id)
              fetchCollections(false)
            }}
            onPlay={onPlay}
            flash={flash}
          />
        )}
      </div>
    )
  }

  // ── Grid view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-primary/10 rounded-2xl text-primary">
            <Layers size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Collections</h2>
            <p className="text-white/30 font-bold text-sm tracking-wide">Hand-built lists — hold a card to pick it up, drag it anywhere</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openCreate} className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white hover:opacity-90">
            <Plus size={15} /> NEW COLLECTION
          </button>
          <button onClick={handleImport} className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-xs font-black text-white/70 hover:text-white">
            <Upload size={15} /> IMPORT
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm font-bold text-white">{notice}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-[1.75rem] bg-white/5" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <Sparkles size={36} className="text-white/20" />
          <p className="text-lg font-black text-white">No collections yet</p>
          <p className="max-w-md text-sm font-bold text-white/40">Create one — give it a name, then add movies and shows by searching.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={openCreate} className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white hover:opacity-90"><Plus size={14} /> NEW</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map((collection, index) => {
            const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length]
            const posters = (collection.preview || []).filter(Boolean).slice(0, 3)
            const count = collection.memberCount ?? 0
            const meta = collection.description || 'Hand-picked titles'
            const fanStyle = (i: number): React.CSSProperties => {
              if (posters.length === 1) return { zIndex: 1 }
              const off = i - (posters.length - 1) / 2
              return {
                transform: `rotate(${off * 9}deg) translateY(${Math.abs(off) * 5}px)`,
                marginLeft: i === 0 ? 0 : -30,
                zIndex: i === 1 ? 2 : 1,
              }
            }
            return (
              <div
                key={collection.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(collection.id, el)
                  else cardRefs.current.delete(collection.id)
                }}
                onPointerDown={(e) => onCardPointerDown(e, collection.id)}
                onPointerMove={onCardPointerMove}
                onPointerUp={() => endDrag(true)}
                onPointerCancel={() => endDrag(true)}
                onContextMenu={(e) => { if (pressRef.current) e.preventDefault() }}
                className={`group relative select-none touch-pan-y ${dragId === collection.id ? 'invisible' : 'cursor-grab transition-transform duration-300 hover:-translate-y-1'}`}
              >
                <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#0b0e14] ring-1 ring-white/10 transition-shadow duration-300 hover:shadow-[0_28px_70px_-24px_rgba(0,0,0,0.9)] hover:ring-white/25">
                <div className="absolute right-3 top-3 z-20 flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(collection) }}
                    title={`Edit "${collection.name}"`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white/70 ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-primary hover:text-white"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(collection) }}
                    title={`Delete "${collection.name}"`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white/70 ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-red-500/80 hover:text-white"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false
                      return
                    }
                    setSelectedId(collection.id)
                  }}
                  className="relative block h-56 w-full overflow-hidden rounded-[1.75rem] text-left"
                >
                  {posters[0] ? (
                    <img
                      src={resolvePoster(posters[0]) || ''}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-2xl saturate-150 transition-transform duration-700 group-hover:scale-[1.32]"
                    />
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
                  )}

                  {posters.length > 0 ? (
                    <div className="absolute bottom-0 right-6 top-7 flex items-end">
                      {posters.map((poster, i) => (
                        <img
                          key={i}
                          src={resolvePoster(poster) || ''}
                          alt=""
                          loading="lazy"
                          style={fanStyle(i)}
                          className="aspect-[2/3] w-[76px] rounded-xl object-cover shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/25"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="absolute bottom-0 right-6 top-7 flex items-end">
                      <div className="flex aspect-[2/3] w-[76px] items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
                        <Layers size={26} className="text-white/40" />
                      </div>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-b from-[#07090d]/95 via-[#07090d]/30 to-[#07090d]/85" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#07090d]/85 via-[#07090d]/25 to-transparent" />
                  <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/[0.08] blur-lg transition-transform delay-100 duration-700 group-hover:translate-x-[550%]" />

                  <div className="absolute inset-x-0 top-0 max-w-[68%] p-5">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.28em] text-white/45">
                      {count} title{count === 1 ? '' : 's'}
                    </p>
                    <p className="truncate text-[26px] font-black leading-tight tracking-tight text-white drop-shadow-lg">{collection.name}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-white/55">{meta}</p>
                  </div>
                </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dragId != null && (() => {
        const dragged = collections.find((c) => c.id === dragId)
        if (!dragged) return null
        return (
          <div
            ref={ghostRef}
            className="pointer-events-none fixed left-0 top-0 z-[90] w-60 cursor-grabbing rounded-3xl border border-white/20 bg-[#141a26]/95 p-4 shadow-[0_28px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur will-change-transform"
          >
            <p className="truncate text-base font-black text-white">{dragged.name}</p>
            <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
              {dragged.memberCount ?? 0} title{(dragged.memberCount ?? 0) === 1 ? '' : 's'} · drop to place
            </p>
          </div>
        )
      })()}

      {builderOpen && (
        <CollectionEditor
          initial={editing}
          onClose={() => setBuilderOpen(false)}
          onSaved={(saved) => {
            setBuilderOpen(false)
            setSelectedId(saved.id)
            fetchCollections(false)
            flash(`Saved "${saved.name}"`)
          }}
          flash={flash}
        />
      )}
    </div>
  )
}

// ─── Collection editor modal (title + subtitle only) ────────────────────────
const CollectionEditor: React.FC<{
  initial: Collection | null
  onClose: () => void
  onSaved: (saved: Collection) => void
  flash: (message: string) => void
}> = ({ initial, onClose, onSaved, flash }) => {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) {
      flash('Give the collection a name first')
      return
    }
    setSaving(true)
    try {
      const payload = { name: name.trim(), description: description.trim() }
      const saved = initial
        ? await window.api.updateCollection(initial.id, payload)
        : await window.api.createCollection(payload)
      onSaved(saved)
    } catch (err) {
      console.error(err)
      flash('Save failed')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#12161f] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black text-white tracking-tight">{initial ? 'Edit collection' : 'New collection'}</h3>
            <p className="text-xs font-bold text-white/40">Name it, add a subtitle, then fill it with titles.</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/60 hover:text-white"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-white/40">Title</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Movies that feel like therapy" className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-white/40">Subtitle</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Cozy rewatches for rainy days" className={inputCls} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.03] px-5 text-xs font-black text-white/60 hover:text-white">CANCEL</button>
          <button onClick={handleSave} disabled={saving} className="flex h-11 items-center rounded-xl bg-primary px-6 text-xs font-black text-white hover:opacity-90 disabled:opacity-50">
            {saving ? 'SAVING…' : initial ? 'SAVE CHANGES' : 'CREATE COLLECTION'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
// ─── Share modal: 2-step wizard (1. save the file, 2. send it) ──────────────
// No links anywhere — the collection always travels as a .json file and the
// receiver opens it with IMPORT.
const ShareModal: React.FC<{
  collection: Collection
  onClose: () => void
  flash: (message: string) => void
}> = ({ collection, onClose, flash }) => {
  const [fileName, setFileName] = useState<string | null>(null)
  const [itemCount, setItemCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState<'whatsapp' | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [savedName, setSavedName] = useState<string | null>(null)
  const [copiedText, setCopiedText] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.getCollectionShareFile(collection.id)
      .then((data) => {
        if (cancelled) return
        if (data?.filename) {
          setFileName(data.filename)
          setItemCount(data.items ?? 0)
        } else {
          console.error('[Collections] Share file failed:', data?.error)
          setFileName(null)
        }
      })
      .catch((err) => {
        console.error('[Collections] Share file failed:', err)
        if (!cancelled) setFileName(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [collection.id])

  const ready = fileName != null
  const saved = savedPath != null

  const shareNote = `${collection.name} — shared collection on MyCinema (${itemCount} title${itemCount === 1 ? '' : 's'}). Attaching the collection file here — open it with IMPORT in MyCinema.`

  // ── Step 1: save the file (save dialog, Downloads preselected). ──────────
  // Step 2 stays locked until the save completes, so the redirect can never
  // race a file dialog and the user always knows exactly where the file is.
  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const result = await window.api.exportCollection(collection.id)
      if (result?.exported && result?.filePath) {
        setSavedPath(result.filePath)
        setSavedName(result.filePath.split(/[\\/]/).pop() || fileName)
        flash('Saved — now send it from step 2')
      } else if (!result?.canceled) {
        flash(`Save failed: ${result?.error || 'unknown error'}`)
      }
    } catch (err) {
      console.error('[Collections] Save failed:', err)
      flash('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleShowSavedFile = async () => {
    if (!savedPath) return
    try {
      const ok = await window.api.openFolder(savedPath)
      if (!ok) flash('Could not reveal the file — it is where you saved it in step 1')
    } catch {
      flash('Could not reveal the file — it is where you saved it in step 1')
    }
  }

  // ── Step 2: open the chat app with the pre-written text (no link). ───────
  // WhatsApp opens natively (whatsapp://) when installed, otherwise in the
  // browser. Telegram always opens Telegram Web in the browser — its share
  // page requires a URL and we never share links — and you hand off to the
  // app from there if you want. Either way the file is attached manually.
  const handleWhatsApp = async () => {
    if (!saved || sending) return
    setSending('whatsapp')
    const webUrl = `https://wa.me/?text=${encodeURIComponent(shareNote)}`
    try {
      // Preferred path: main process opens the native app when installed.
      // If the host is older than this UI (dev session started before a
      // restart), the channel won't exist — fall back to a plain browser
      // open instead of failing.
      const openChatShare = (window.api as any)?.openChatShare
      if (typeof openChatShare === 'function') {
        const result = await openChatShare('whatsapp', shareNote)
        if (result?.opened) {
          flash(
            result?.via === 'app'
              ? 'WhatsApp opened — pick a chat and attach the saved file'
              : 'WhatsApp opened in browser — attach the saved file in the chat',
          )
          return
        }
        console.warn('[Collections] Chat share fell through, using browser fallback')
      } else {
        console.warn('[Collections] open-chat-share unavailable (stale host?) — using browser fallback')
      }
      window.open(webUrl, '_blank')
      flash('Opening in browser — attach the saved file in the chat')
    } catch (err) {
      console.error('[Collections] Chat share failed:', err)
      try {
        window.open(webUrl, '_blank')
        flash('Opening in browser — attach the saved file in the chat')
      } catch {
        flash('Could not open WhatsApp')
      }
    } finally {
      setSending(null)
    }
  }

  const handleTelegram = () => {
    if (!saved || sending) return
    // Synchronous browser open (as before) — never blocked, and you take it
    // to the Telegram app yourself from there if you want.
    window.open('https://web.telegram.org/', '_blank')
    flash('Telegram Web opened — paste the message, then attach the saved file')
  }

  const handleCopyNote = async () => {
    try {
      await navigator.clipboard.writeText(shareNote)
      setCopiedText(true)
      flash('Message copied — paste it into the chat')
      window.setTimeout(() => setCopiedText(false), 2000)
    } catch {
      flash('Copy failed')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#12161f] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">Share collection</h3>
            <p className="truncate text-xs font-bold text-white/40">{collection.name} · {itemCount} title{itemCount === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/60 hover:text-white"><X size={16} /></button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm font-bold text-white/30">Preparing…</p>
        ) : !ready ? (
          <p className="py-8 text-center text-sm font-bold text-white/30">Could not prepare this collection for sharing.</p>
        ) : (
          <div className="space-y-3">
            {/* Step 1 — save the file */}
            <div className={`rounded-2xl border p-4 ${saved ? 'border-emerald-400/25 bg-emerald-400/[0.06]' : 'border-white/10 bg-white/[0.02]'}`}>
              <p className="flex items-center gap-2 text-xs font-black tracking-wide text-white">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${saved ? 'bg-emerald-500 text-white' : 'bg-primary text-white'}`}>1</span>
                SAVE THE FILE
              </p>
              <p className="mt-1.5 text-[11px] font-bold leading-relaxed text-white/45">
                {collection.name} · {itemCount} title{itemCount === 1 ? '' : 's'} · {fileName} — Downloads is preselected, so you always know where it is.
              </p>
              {saved ? (
                <>
                  <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] font-black text-emerald-300" title={savedPath || ''}>
                    <Check size={14} /> {savedName}
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <button
                      onClick={handleShowSavedFile}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-[11px] font-black text-white hover:opacity-90"
                    >
                      <FolderOpen size={15} /> SHOW FILE
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11px] font-black text-white/70 hover:text-white disabled:opacity-50"
                    >
                      <FileDown size={15} /> SAVE AGAIN
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-black text-white hover:opacity-90 disabled:opacity-50"
                >
                  <FileDown size={16} /> {saving ? 'SAVING…' : 'SAVE FILE'}
                </button>
              )}
            </div>

            {/* Step 2 — send it */}
            <div className={`rounded-2xl border p-4 ${saved ? 'border-white/10 bg-white/[0.02]' : 'border-white/5 bg-white/[0.01] opacity-60'}`}>
              <p className="flex items-center gap-2 text-xs font-black tracking-wide text-white">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${saved ? 'bg-primary text-white' : 'bg-white/10 text-white/40'}`}>2</span>
                SEND IT IN ANY CHAT APP
              </p>
              {!saved ? (
                <p className="mt-1.5 text-[11px] font-bold text-white/35">Save the file first — then WhatsApp and Telegram unlock.</p>
              ) : (
                <>
                  <p className="mt-1.5 text-[11px] font-bold leading-relaxed text-white/45">
                    WhatsApp opens with your message pre-written (no links). Telegram opens Telegram Web — paste the message there. Then attach the file you just saved.
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <button
                      onClick={handleWhatsApp}
                      disabled={sending != null}
                      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2 text-center text-white/60 transition-all hover:border-emerald-400/35 hover:bg-emerald-400/10 hover:text-white disabled:opacity-50"
                    >
                      <MessageCircle size={20} />
                      <span className="text-[11px] font-black">{sending === 'whatsapp' ? 'OPENING…' : 'WHATSAPP'}</span>
                    </button>
                    <button
                      onClick={handleTelegram}
                      disabled={sending != null}
                      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2 text-center text-white/60 transition-all hover:border-sky-400/35 hover:bg-sky-400/10 hover:text-white disabled:opacity-50"
                    >
                      <Send size={20} />
                      <span className="text-[11px] font-black">TELEGRAM</span>
                    </button>
                  </div>
                  <button
                    onClick={handleCopyNote}
                    className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-3 text-[10px] font-black text-white/45 hover:text-white"
                  >
                    <Copy size={13} /> {copiedText ? 'MESSAGE COPIED' : 'COPY MESSAGE TEXT'}
                  </button>
                </>
              )}
            </div>

            <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[11px] font-bold leading-relaxed text-white/45">
              <span className="text-white/70">They save the file</span> and open it with IMPORT in Collections — the collection arrives complete.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ─── Title picker modal (pin library titles + add any TMDB title) ──────────
const TMDB_THUMB = 'https://image.tmdb.org/t/p/w200'

const TitlePicker: React.FC<{
  collection: Collection
  onClose: () => void
  onPlay: (video: Video) => void
  flash: (message: string) => void
}> = ({ collection, onClose, flash }) => {
  const [tab, setTab] = useState<'library' | 'tmdb'>('tmdb')
  const [videos, setVideos] = useState<Video[]>([])
  const [query, setQuery] = useState('')
  const [pinned, setPinned] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [tmdbQuery, setTmdbQuery] = useState('')
  const [tmdbResults, setTmdbResults] = useState<any[]>([])
  const [tmdbSearching, setTmdbSearching] = useState(false)
  const [externalByTmdb, setExternalByTmdb] = useState<Map<number, number>>(new Map())
  const [busyTmdbId, setBusyTmdbId] = useState<number | null>(null)
  const tmdbTimer = useRef<number | null>(null)
  const tmdbInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (tab !== 'tmdb') return
    const timer = window.setTimeout(() => tmdbInputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [tab])

  useEffect(() => {
    (async () => {
      try {
        const [all, members] = await Promise.all([
          window.api.getVideos(),
          window.api.getCollectionMembers(collection.id),
        ])
        setVideos(Array.isArray(all) ? all : [])
        const memberList: Video[] = Array.isArray(members) ? members : []
        setPinned(new Set(memberList.filter((m) => !m.isExternal).map((m: Video) => m.id)))
        const ext = new Map<number, number>()
        for (const m of memberList) {
          const tmdbId = (m as any).tmdb_id
          const extId = (m as any).collection_external_id
          if (m.isExternal && tmdbId != null && extId != null) ext.set(Number(tmdbId), Number(extId))
        }
        setExternalByTmdb(ext)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    })()
  }, [collection.id])

  useEffect(() => {
    if (tab !== 'tmdb') return
    const trimmed = tmdbQuery.trim()
    if (tmdbTimer.current) window.clearTimeout(tmdbTimer.current)
    if (!trimmed) {
      setTmdbResults([])
      setTmdbSearching(false)
      return
    }
    setTmdbSearching(true)
    tmdbTimer.current = window.setTimeout(async () => {
      try {
        const data = await window.api.searchTMDB(trimmed)
        setTmdbResults(((Array.isArray(data) ? data : []) as any[])
          .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
          .slice(0, 20))
      } catch (err) {
        console.error('[Collections] TMDB search error:', err)
        setTmdbResults([])
      } finally {
        setTmdbSearching(false)
      }
    }, 500)
    return () => {
      if (tmdbTimer.current) window.clearTimeout(tmdbTimer.current)
    }
  }, [tmdbQuery, tab])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = videos.filter((v) => v.type === 'movie' || v.type === 'series')
    if (!q) return list.slice(0, 60)
    return list.filter((v) =>
      [v.title, v.series_name, String(v.release_year || '')].filter(Boolean).join(' ').toLowerCase().includes(q),
    ).slice(0, 60)
  }, [videos, query])

  const toggle = async (video: Video) => {
    try {
      if (pinned.has(video.id)) {
        await window.api.unpinCollectionVideo(collection.id, video.id)
        setPinned((prev) => {
          const next = new Set(prev)
          next.delete(video.id)
          return next
        })
      } else {
        await window.api.pinCollectionVideo(collection.id, video.id)
        setPinned((prev) => new Set(prev).add(video.id))
      }
    } catch (err) {
      console.error(err)
      flash('Pin update failed')
    }
  }

  const toggleExternal = async (item: any) => {
    const tmdbId = Number(item.id)
    if (!Number.isFinite(tmdbId) || busyTmdbId != null) return
    setBusyTmdbId(tmdbId)
    try {
      const existing = externalByTmdb.get(tmdbId)
      if (existing != null) {
        await window.api.removeCollectionExternal(existing)
        setExternalByTmdb((prev) => {
          const next = new Map(prev)
          next.delete(tmdbId)
          return next
        })
      } else {
        const added = await window.api.addCollectionExternal(collection.id, item)
        const extId = (added as any)?.collection_external_id
        if (extId != null) {
          setExternalByTmdb((prev) => new Map(prev).set(tmdbId, Number(extId)))
        } else {
          const members = await window.api.getCollectionMembers(collection.id)
          const match = (Array.isArray(members) ? members : []).find((m: any) => m.isExternal && Number(m.tmdb_id) === tmdbId)
          if (match) setExternalByTmdb((prev) => new Map(prev).set(tmdbId, Number((match as any).collection_external_id)))
        }
      }
    } catch (err) {
      console.error(err)
      flash('Online title update failed')
    } finally {
      setBusyTmdbId(null)
    }
  }

  const tmdbYearOf = (item: any) => (item.release_date || item.first_air_date || '').slice(0, 4)

  return createPortal(
    <div className="fixed inset-0 z-[100] flex overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="m-auto flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#12161f] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">Add titles</h3>
            <p className="text-xs font-bold text-white/40">Search any movie or show and tap ADD — or pin from MY LIBRARY. {pinned.size + externalByTmdb.size} added.</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/60 hover:text-white"><X size={16} /></button>
        </div>
        <div className="mb-4 grid shrink-0 grid-cols-2 gap-2">
          <button
            onClick={() => setTab('tmdb')}
            className={`flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-black ${tab === 'tmdb' ? 'bg-primary text-white' : 'bg-white/[0.04] text-white/50 hover:text-white'}`}
          >
            <Search size={13} /> SEARCH ONLINE
          </button>
          <button
            onClick={() => setTab('library')}
            className={`flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-black ${tab === 'library' ? 'bg-primary text-white' : 'bg-white/[0.04] text-white/50 hover:text-white'}`}
          >
            MY LIBRARY
          </button>
        </div>
        {tab === 'library' ? (
          <>
            <div className="group relative mb-4 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your library" className={`${inputCls} pl-10`} />
            </div>
            <div className="flex-1 min-h-[240px] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <p className="py-8 text-center text-sm font-bold text-white/30">Loading library…</p>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm font-bold text-white/30">No titles found</p>
              ) : (
                filtered.map((video) => {
                  const isPinned = pinned.has(video.id)
                  const poster = resolvePoster(video.poster_path)
                  return (
                    <div key={video.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5">
                        {poster && <img src={poster} alt="" className="h-full w-full object-cover" loading="lazy" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-white">{video.series_name || video.title}</p>
                        <p className="text-[11px] font-bold text-white/35">{video.release_year || ''} {video.vote_average ? `★ ${Number(video.vote_average).toFixed(1)}` : ''}</p>
                      </div>
                      <button
                        onClick={() => toggle(video)}
                        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-black ${isPinned
                          ? 'bg-primary/15 text-primary'
                          : 'bg-white/[0.05] text-white/50 hover:text-white'}`}
                      >
                        {isPinned ? <><PinOff size={13} /> UNPIN</> : <><Pin size={13} /> PIN</>}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </>
        ) : (
          <>
            <div className="group relative mb-4 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={17} />
              <input ref={tmdbInputRef} value={tmdbQuery} onChange={(e) => setTmdbQuery(e.target.value)} placeholder="Type a movie or show name…" className={`${inputCls} pl-10`} />
            </div>
            <div className="flex-1 min-h-[240px] space-y-2 overflow-y-auto pr-1">
              {tmdbSearching ? (
                <p className="py-8 text-center text-sm font-bold text-white/30">Searching…</p>
              ) : !tmdbQuery.trim() ? (
                <p className="py-8 text-center text-sm font-bold text-white/30">Type to search the full TMDB catalog</p>
              ) : tmdbResults.length === 0 ? (
                <p className="py-8 text-center text-sm font-bold text-white/30">No online titles found</p>
              ) : (
                tmdbResults.map((item) => {
                  const tmdbId = Number(item.id)
                  const isAdded = externalByTmdb.has(tmdbId)
                  const poster = item.poster_path ? `${TMDB_THUMB}${item.poster_path}` : null
                  return (
                    <div key={tmdbId} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5">
                        {poster && <img src={poster} alt="" className="h-full w-full object-cover" loading="lazy" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-white">{item.title || item.name}</p>
                        <p className="text-[11px] font-bold text-white/35">
                          {tmdbYearOf(item)} {item.vote_average ? `★ ${Number(item.vote_average).toFixed(1)}` : ''} · {item.media_type === 'tv' ? 'Series' : 'Movie'} · <span className="text-sky-300">Online</span>
                        </p>
                      </div>
                      <button
                        onClick={() => toggleExternal(item)}
                        disabled={busyTmdbId === tmdbId}
                        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-black disabled:opacity-50 ${isAdded
                          ? 'bg-primary/15 text-primary'
                          : 'bg-white/[0.05] text-white/50 hover:text-white'}`}
                      >
                        {isAdded ? <><PinOff size={13} /> ADDED</> : <><Plus size={13} /> ADD</>}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
        <button onClick={onClose} className="mt-4 flex h-11 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-black text-white hover:opacity-90">DONE</button>
      </div>
    </div>,
    document.body,
  )
}

export default Collections
