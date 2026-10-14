import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import type {
  FtCategory,
  FtChannel,
  FtYouTubeImportChannel,
  FtYouTubeImportLoadResult,
  FtYouTubeImportRefreshProgress,
  FtYouTubeImportStatus,
} from '../../types'
import { categoryDot } from '../../utils/focusTube'

interface ImportSubscriptionsProps {
  categories: FtCategory[]
  initialCategoryId: number | null
  onClose: () => void
  onImported: () => void
}

interface ImportSummary {
  added: string[]
  alreadyPresent: string[]
  skipped: number
  failed: string[]
  undoAvailable: boolean
  undoId: string | null
  undone?: boolean
}

const PAGE_SIZE = 50

const Avatar: React.FC<{ channel: FtYouTubeImportChannel }> = ({ channel }) => {
  const [failed, setFailed] = useState(false)
  return channel.avatarUrl && !failed ? (
    <img
      src={channel.avatarUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-full border border-white/10 bg-white/[0.06] object-cover"
    />
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-gradient-to-br from-primary/30 to-primary/5 text-sm font-black uppercase text-white">
      {(channel.title || '?').trim().charAt(0) || '?'}
    </div>
  )
}

function isLoadResult(value: FtYouTubeImportLoadResult | { error: string; cancelled?: boolean }): value is FtYouTubeImportLoadResult {
  return Array.isArray((value as FtYouTubeImportLoadResult)?.channels)
}

const ImportSubscriptions: React.FC<ImportSubscriptionsProps> = ({ categories, initialCategoryId, onClose, onImported }) => {
  const [status, setStatus] = useState<FtYouTubeImportStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ stage: 'authorization' | 'subscriptions'; page?: number; found?: number } | null>(null)
  const [loadResult, setLoadResult] = useState<FtYouTubeImportLoadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [channels, setChannels] = useState<FtYouTubeImportChannel[]>([])
  const [existing, setExisting] = useState<Map<string, FtChannel>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assignments, setAssignments] = useState<Record<string, number[]>>({})
  const [organizeNow, setOrganizeNow] = useState(Boolean(initialCategoryId && categories.some((category) => category.id === initialCategoryId)))
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState<{ completed: number; total: number } | null>(null)
  const activeRequestIdRef = useRef<string | null>(null)

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      setStatus(await window.api.ftYouTubeImportStatus())
    } catch (loadError: any) {
      setStatus({ configured: false, secureStorage: false, connected: false, error: loadError?.message || 'Could not check Google connection status.' })
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
    const removeLoadProgress = window.api.onFtYouTubeImportProgress((next) => setProgress(next))
    const removeRefreshProgress = window.api.onFtYouTubeImportRefreshProgress((next: FtYouTubeImportRefreshProgress) => {
      if (next.requestId !== activeRequestIdRef.current) return
      setRefreshProgress({ completed: next.completed, total: next.total })
    })
    return () => {
      removeLoadProgress()
      removeRefreshProgress()
    }
  }, [loadStatus])

  const startLoad = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    setProgress(status?.connected ? { stage: 'subscriptions', page: 0, found: 0 } : { stage: 'authorization' })
    setChannels([])
    setLoadResult(null)
    setSummary(null)
    setPage(0)
    try {
      const loaded = await window.api.ftYouTubeImportConnect()
      if (!isLoadResult(loaded)) {
        setError(loaded.error)
        return
      }
      const localChannels = await window.api.ftListChannels(null)
      const existingById = new Map((localChannels || []).map((channel) => [channel.channelId, channel]))
      setExisting(existingById)
      setChannels(loaded.channels)
      setLoadResult(loaded)
      setSelected(new Set(loaded.channels.map((channel) => channel.channelId)))
      const initialAssignments: Record<string, number[]> = {}
      if (initialCategoryId && categories.some((category) => category.id === initialCategoryId)) {
        for (const channel of loaded.channels) initialAssignments[channel.channelId] = [initialCategoryId]
        setOrganizeNow(true)
      } else {
        setOrganizeNow(false)
      }
      setAssignments(initialAssignments)
      if (loaded.error) setNotice(loaded.error)
      if (loaded.cancelled && !loaded.channels.length) setError(loaded.error || 'Loading was canceled.')
      await loadStatus()
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load YouTube subscriptions.')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [status?.connected, initialCategoryId, categories, loadStatus])

  const cancelLoad = useCallback(async () => {
    await window.api.ftYouTubeImportCancel()
  }, [])

  const disconnect = useCallback(async () => {
    setDisconnecting(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.api.ftYouTubeImportDisconnect()
      if (result.disconnected) {
        setStatus((current) => current ? { ...current, connected: false, hasSavedCredentials: false } : current)
        setChannels([])
        setLoadResult(null)
        setSelected(new Set())
        setAssignments({})
        setSummary(null)
        setNotice(result.revoked
          ? 'The Google connection was disconnected and the credentials were removed.'
          : 'The saved credentials were removed. Google could not confirm revocation; you can remove Focus Tube access from your Google Account settings.')
      } else {
        setError('Could not remove the saved Google credentials.')
      }
      await loadStatus()
    } catch (disconnectError: any) {
      setError(disconnectError?.message || 'Could not disconnect the Google account.')
    } finally {
      setDisconnecting(false)
    }
  }, [loadStatus])

  const filteredChannels = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return channels
    return channels.filter((channel) =>
      channel.title.toLocaleLowerCase().includes(needle)
      || channel.channelId.toLocaleLowerCase().includes(needle),
    )
  }, [channels, query])
  const pageCount = Math.max(1, Math.ceil(filteredChannels.length / PAGE_SIZE))
  const visibleChannels = filteredChannels.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const selectedCount = selected.size

  useEffect(() => {
    setPage(0)
  }, [query])

  const toggleSelected = (channelId: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(channelId)) next.delete(channelId)
      else next.add(channelId)
      return next
    })
  }

  const assignToSelected = (categoryId: number) => {
    setAssignments((previous) => {
      const next = { ...previous }
      for (const channelId of selected) {
        const currentChannel = existing.get(channelId)
        if (currentChannel?.categoryIds.includes(categoryId)) continue
        const current = next[channelId] || []
        if (!current.includes(categoryId)) next[channelId] = [...current, categoryId]
      }
      return next
    })
  }

  const toggleAssignment = (channelId: string, categoryId: number) => {
    if (existing.get(channelId)?.categoryIds.includes(categoryId)) return
    setAssignments((previous) => {
      const current = previous[channelId] || []
      return {
        ...previous,
        [channelId]: current.includes(categoryId)
          ? current.filter((id) => id !== categoryId)
          : [...current, categoryId],
      }
    })
  }

  const clearSelectedAssignments = () => {
    setAssignments((previous) => {
      const next = { ...previous }
      for (const channelId of selected) next[channelId] = []
      return next
    })
  }

  const refreshFeeds = useCallback(async (channelIds: string[], retrying = false) => {
    const uniqueIds = [...new Set(channelIds)]
    if (!uniqueIds.length) return
    const requestId = window.crypto.randomUUID()
    activeRequestIdRef.current = requestId
    setRefreshing(true)
    setRefreshProgress({ completed: 0, total: uniqueIds.length })
    try {
      const result = await window.api.ftYouTubeImportRefresh(uniqueIds, requestId)
      setSummary((previous) => {
        if (!previous) return previous
        const failed = retrying
          ? [...new Set([...previous.failed.filter((id) => !uniqueIds.includes(id)), ...result.failed])]
          : result.failed
        return { ...previous, failed }
      })
      if (result.failed.length === 0) setNotice('Feed refresh finished. Imported channels are ready in Focus Tube.')
    } catch (refreshError: any) {
      setSummary((previous) => previous ? {
        ...previous,
        failed: [...new Set([...previous.failed, ...uniqueIds])],
      } : previous)
      setError(refreshError?.message || 'Feed refresh failed. The imported channels are still saved.')
    } finally {
      activeRequestIdRef.current = null
      setRefreshing(false)
    }
  }, [])

  const importSelected = useCallback(async () => {
    const chosen = channels.filter((channel) => selected.has(channel.channelId))
    if (!chosen.length) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const categoryAssignments: Record<string, number[]> = {}
      if (organizeNow) {
        for (const channel of chosen) {
          const categoryIds = assignments[channel.channelId] || []
          if (categoryIds.length) categoryAssignments[channel.channelId] = categoryIds
        }
      }
      const result = await window.api.ftYouTubeImportSave(chosen, categoryAssignments)
      if ('error' in result) {
        setError(result.error)
        return
      }
      const nextSummary: ImportSummary = {
        added: result.added,
        alreadyPresent: result.alreadyPresent,
        skipped: Math.max(0, channels.length - chosen.length) + result.skipped.length,
        failed: [],
        undoAvailable: Boolean(result.undoId),
        undoId: result.undoId,
      }
      setSummary(nextSummary)
      onImported()
      if (result.skipped.length) setNotice(`${result.skipped.length} invalid channel record${result.skipped.length === 1 ? ' was' : 's were'} skipped.`)
      await refreshFeeds(result.added)
      if (result.added.length === 0) setNotice('Import finished. All selected channels were already in Focus Tube.')
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save the selected channels.')
    } finally {
      setSaving(false)
    }
  }, [channels, selected, organizeNow, assignments, onImported, refreshFeeds])

  const undoImport = useCallback(async () => {
    const undoId = summary?.undoId
    if (!undoId) return
    setUndoing(true)
    setError(null)
    try {
      const result = await window.api.ftYouTubeImportUndo(undoId)
      if ('error' in result) {
        setError(result.error)
        return
      }
      const removedIds = new Set(result.removedChannelIds)
      setSummary((previous) => previous ? {
        ...previous,
        added: previous.added.filter((channelId) => !removedIds.has(channelId)),
        failed: previous.failed.filter((channelId) => !removedIds.has(channelId)),
        undoAvailable: false,
        undoId: null,
        undone: true,
      } : previous)
      const kept = result.retainedChannels.length
      setNotice(`Undo removed ${result.removedChannels} imported channel${result.removedChannels === 1 ? '' : 's'} and ${result.removedMemberships} category assignment${result.removedMemberships === 1 ? '' : 's'}.${kept ? ` ${kept} channel${kept === 1 ? ' was' : 's were'} kept because it has Focus Tube activity or other category memberships.` : ''}`)
      onImported()
    } catch (undoError: any) {
      setError(undoError?.message || 'Could not undo this import.')
    } finally {
      setUndoing(false)
    }
  }, [onImported, summary?.undoId])

  const title = loading
    ? progress?.stage === 'authorization' ? 'Waiting for Google' : 'Reading subscriptions'
    : summary ? 'Import complete' : 'Review subscriptions'
  const canConnect = Boolean(status?.configured && status.secureStorage && !(status.hasSavedCredentials && !status.connected))
  const connected = Boolean(status?.connected)
  const startButtonLabel = connected ? 'Load subscriptions' : 'Connect Google account'
  const currentPage = Math.min(page + 1, pageCount)

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-black/80 p-3 pt-4 backdrop-blur-sm sm:p-6 sm:pt-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="youtube-import-title"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-[0_40px_120px_-30px_rgba(0,0,0,1)] sm:max-h-[calc(100vh-4rem)]"
      >
        <header className="relative shrink-0 overflow-hidden border-b border-white/[0.07] px-4 py-4 sm:px-6 sm:py-5">
          <div aria-hidden className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-[80px]" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-gradient-to-br from-primary/25 to-primary/5 text-primary">
                {summary ? <CheckCheck size={20} /> : <Download size={20} />}
              </div>
              <div className="min-w-0">
                <h2 id="youtube-import-title" className="text-lg font-black uppercase italic tracking-tight text-white sm:text-xl">
                  {title}
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-white/40">
                  Import YouTube subscriptions into Focus Tube
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { if (loading) void cancelLoad(); onClose() }}
              aria-label="Close YouTube subscription import"
              className="shrink-0 rounded-lg p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-300/15 bg-sky-300/[0.06] px-3.5 py-3 sm:px-4">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-sky-200" />
            <p className="text-xs font-semibold leading-relaxed text-sky-100/75">
              Focus Tube reads your YouTube subscription list and saves selected channels locally. It will not subscribe or unsubscribe anyone on YouTube.
            </p>
          </div>

          {status?.error && (
            <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3">
              <p className="flex items-start gap-2 text-xs font-semibold leading-relaxed text-amber-100/80">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {status.error}
              </p>
              {!status.configured && (
                <p className="mt-2 text-[11px] font-semibold text-amber-100/50">
                  See <span className="font-mono">docs/FOCUS_TUBE_GOOGLE_OAUTH.md</span> for setup instructions.
                </p>
              )}
            </div>
          )}

          {(status?.connected || status?.hasSavedCredentials) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-3.5 py-2.5">
              <span className={`inline-flex items-center gap-2 text-xs font-bold ${status.connected ? 'text-emerald-100/75' : 'text-amber-100/70'}`}>
                <span className={`h-2 w-2 rounded-full ${status.connected ? 'bg-emerald-300' : 'bg-amber-300'}`} />
                {status.connected ? 'Google account connected' : 'Saved Google connection needs attention'}
              </span>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={disconnecting || loading}
                className="text-[10px] font-black uppercase tracking-widest text-white/40 transition-colors hover:text-red-300 disabled:opacity-40"
              >
                {disconnecting ? 'Disconnecting…' : status.connected ? 'Disconnect' : 'Remove saved connection'}
              </button>
            </div>
          )}

          {error && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-300/20 bg-red-300/[0.06] px-3.5 py-3 text-xs font-semibold leading-relaxed text-red-200/90">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3.5 py-3 text-xs font-semibold leading-relaxed text-amber-100/75">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {!loadResult && !loading && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center sm:py-14">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03] text-white/40">
                <Download size={23} />
              </div>
              <h3 className="mt-4 text-sm font-black uppercase italic tracking-wide text-white">Bring your channels with you</h3>
              <p className="mt-2 max-w-lg text-xs font-semibold leading-relaxed text-white/40">
                {status?.connected
                  ? 'Load the complete list of channels you follow, review it, and choose what to add.'
                  : 'Connect Google in your system browser. Focus Tube asks only for read access to your YouTube subscription list.'}
              </p>
              <button
                type="button"
                onClick={() => void startLoad()}
                disabled={statusLoading || !canConnect}
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-black uppercase tracking-widest text-white shadow-[0_10px_30px_-12px_rgba(229,9,20,0.9)] transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {statusLoading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {statusLoading ? 'Checking connection…' : startButtonLabel}
              </button>
              {connected && error && /authorization expired|reconnect/i.test(error) && (
                <button
                  type="button"
                  onClick={() => void disconnect().then(() => startLoad())}
                  disabled={disconnecting}
                  className="mt-3 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 transition-colors hover:text-white disabled:opacity-40"
                >
                  Reconnect Google account
                </button>
              )}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-12 text-center">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="mt-4 text-sm font-black uppercase italic tracking-wide text-white">
                {progress?.stage === 'authorization' ? 'Complete sign-in in your browser' : 'Loading every subscription page'}
              </p>
              <p className="mt-2 text-xs font-semibold text-white/40">
                {progress?.stage === 'authorization'
                  ? 'Focus Tube is waiting for Google to return to this app.'
                  : `Page ${progress?.page || 0}${progress?.found !== undefined ? ` · ${progress.found} channels found` : ''}`}
              </p>
              <button
                type="button"
                onClick={() => void cancelLoad()}
                className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Cancel loading
              </button>
            </div>
          )}

          {loadResult && !loading && (
            <>
              {!loadResult.complete && loadResult.error && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3.5 py-3 text-xs font-semibold leading-relaxed text-amber-100/80">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>Partial results: {loadResult.error} You can import the channels received so far or load the list again.</span>
                </div>
              )}

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase italic tracking-wide text-white">
                    {loadResult.channels.length} channel{loadResult.channels.length === 1 ? '' : 's'} found
                    {!loadResult.complete && <span className="ml-2 text-[10px] not-italic text-amber-200/70">PARTIAL</span>}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-white/35">
                    {selectedCount} selected · {loadResult.pages} page{loadResult.pages === 1 ? '' : 's'} loaded
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(channels.map((channel) => channel.channelId)))}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    Clear selection
                  </button>
                  <button
                    type="button"
                    onClick={() => void startLoad()}
                    disabled={saving || refreshing}
                    title="Load the latest subscription list"
                    className="rounded-lg p-2 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5 sm:p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest text-white/70">Organize these channels</p>
                    <p className="mt-1 text-[11px] font-semibold leading-relaxed text-white/35">
                      {initialCategoryId && categories.some((category) => category.id === initialCategoryId)
                        ? `New channels start in ${categories.find((category) => category.id === initialCategoryId)?.name}. Existing category memberships are preserved.`
                        : 'Choose categories now, or import without categories and organize them later.'}
                    </p>
                  </div>
                  <div className="flex shrink-0 rounded-xl border border-white/10 bg-black/20 p-1">
                    <button
                      type="button"
                      onClick={() => setOrganizeNow(true)}
                      disabled={!categories.length}
                      aria-pressed={organizeNow}
                      className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${organizeNow ? 'bg-primary/20 text-white' : 'text-white/40 hover:text-white'}`}
                    >
                      Organize now
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrganizeNow(false)}
                      aria-pressed={!organizeNow}
                      className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${!organizeNow ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                    >
                      Organize later
                    </button>
                  </div>
                </div>

                {organizeNow && categories.length > 0 && (
                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/35">Add selected to</span>
                      <div className="flex flex-1 gap-2">
                        <select
                          value={bulkCategoryId}
                          onChange={(event) => setBulkCategoryId(event.target.value)}
                          aria-label="Choose a category for selected channels"
                          className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-xs font-semibold text-white focus:border-primary/50 focus:outline-none"
                        >
                          <option value="" className="bg-surface">Choose category…</option>
                          {categories.map((category) => <option key={category.id} value={category.id} className="bg-surface">{category.name}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => { if (bulkCategoryId) assignToSelected(Number(bulkCategoryId)) }}
                          disabled={!bulkCategoryId || !selectedCount}
                          className="h-9 shrink-0 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-[10px] font-black uppercase tracking-widest text-white/65 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                        >
                          Add category
                        </button>
                        <button
                          type="button"
                          onClick={clearSelectedAssignments}
                          disabled={!selectedCount}
                          className="h-9 shrink-0 rounded-lg px-2 text-[10px] font-black uppercase tracking-widest text-white/35 transition-colors hover:text-white disabled:opacity-30"
                        >
                          Clear new assignments
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] font-semibold text-white/30">
                      Category choices only add memberships. They never remove a channel’s existing categories.
                    </p>
                  </div>
                )}
                {organizeNow && categories.length === 0 && (
                  <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] font-semibold text-amber-200/60">
                    Create a category in Your channels first, or choose Organize later.
                  </p>
                )}
              </div>

              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Filter YouTube subscriptions"
                    placeholder="Search channel title or ID"
                    className="h-10 w-full rounded-xl border border-white/10 bg-black/25 pl-10 pr-3 text-xs font-semibold text-white placeholder:text-white/25 transition-colors focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
                  />
                </div>
                <p className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-white/30">
                  {filteredChannels.length} shown · {existing.size} already in Focus Tube
                </p>
              </div>

              {channels.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center">
                  <p className="text-sm font-black uppercase italic text-white/60">
                    {loadResult.complete ? 'No subscriptions found' : 'No channels loaded yet'}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-white/35">
                    {loadResult.complete
                      ? 'This Google account returned an empty YouTube subscription list.'
                      : 'Retry the subscription load. Focus Tube has not imported any channels.'}
                  </p>
                  {!loadResult.complete && (
                    <button
                      type="button"
                      onClick={() => void startLoad()}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      <RotateCcw size={12} /> Retry load
                    </button>
                  )}
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-xs font-semibold text-white/35">
                  No channel titles or IDs match “{query}”.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleChannels.map((channel) => {
                    const localChannel = existing.get(channel.channelId)
                    const selectedCategories = assignments[channel.channelId] || []
                    return (
                      <article key={channel.channelId} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 transition-colors hover:border-white/10 sm:px-4">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selected.has(channel.channelId)}
                            onChange={() => toggleSelected(channel.channelId)}
                            aria-label={`${selected.has(channel.channelId) ? 'Remove' : 'Select'} ${channel.title} for import`}
                            className="mt-3 h-4 w-4 shrink-0 accent-red-500"
                          />
                          <Avatar channel={channel} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="max-w-full truncate text-sm font-bold text-white">{channel.title}</p>
                              {localChannel ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-200/80">
                                  <Check size={10} /> Already in Focus Tube
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 truncate font-mono text-[10px] text-white/30">{channel.channelId}</p>
                            {localChannel && localChannel.categoryIds.length > 0 && (
                              <p className="mt-1 text-[10px] font-semibold text-white/35">
                                Existing categories: {localChannel.categoryIds.map((id) => categories.find((category) => category.id === id)?.name).filter(Boolean).join(', ') || 'some categories'}
                              </p>
                            )}
                          </div>
                        </div>

                        {organizeNow && categories.length > 0 && (
                          <div className="mt-2.5 ml-7 flex flex-wrap items-center gap-1.5 border-t border-white/[0.05] pt-2.5 sm:ml-11">
                            <span className="mr-1 text-[9px] font-black uppercase tracking-widest text-white/25">Categories</span>
                            {categories.map((category) => {
                              const alreadyInCategory = Boolean(localChannel?.categoryIds.includes(category.id))
                              const assigned = selectedCategories.includes(category.id)
                              const active = alreadyInCategory || assigned
                              return (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => toggleAssignment(channel.channelId, category.id)}
                                  disabled={alreadyInCategory}
                                  aria-pressed={active}
                                  title={alreadyInCategory ? `Already in ${category.name}` : assigned ? `Remove ${category.name} assignment` : `Add to ${category.name}`}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors disabled:cursor-default ${active ? 'border-primary/35 bg-primary/10 text-white/80' : 'border-white/[0.07] bg-white/[0.02] text-white/35 hover:border-white/20 hover:text-white/70'}`}
                                >
                                  {active
                                    ? <Check size={10} />
                                    : <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(category.color)}`} />}
                                  {category.name}{alreadyInCategory ? ' · current' : ''}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}

              {filteredChannels.length > PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Page {currentPage} of {pageCount}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(0, current - 1))}
                      disabled={page === 0}
                      aria-label="Previous page"
                      className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-25"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                      disabled={page >= pageCount - 1}
                      aria-label="Next page"
                      className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-25"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {summary && (
            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-100/80">Import results</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5">
                  <p className="text-lg font-black tabular-nums text-white">{summary.added.length}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Added</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5">
                  <p className="text-lg font-black tabular-nums text-white">{summary.alreadyPresent.length}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Already present</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5">
                  <p className="text-lg font-black tabular-nums text-white">{summary.skipped}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Skipped</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5">
                  <p className={`text-lg font-black tabular-nums ${summary.failed.length ? 'text-red-200' : 'text-white'}`}>{summary.failed.length}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Feed failures</p>
                </div>
              </div>
              {refreshing && refreshProgress && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <span className="inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Loading channel feeds</span>
                    <span>{refreshProgress.completed} / {refreshProgress.total}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${refreshProgress.total ? (refreshProgress.completed / refreshProgress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
              {summary.failed.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] font-semibold text-red-200/70">
                    {summary.failed.length} channel feed{summary.failed.length === 1 ? '' : 's'} could not be loaded. The channels are still imported.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refreshFeeds(summary.failed, true)}
                    disabled={refreshing}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200/15 bg-red-200/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-100/75 transition-colors hover:bg-red-200/[0.12] disabled:opacity-40"
                  >
                    {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    Retry failed feeds
                  </button>
                </div>
              )}
              {summary.undoAvailable && !summary.undone && (
                <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[10px] font-semibold text-white/35">
                    Undo removes only channels and category assignments created by this import. Channels with later activity are kept.
                  </p>
                  <button
                    type="button"
                    onClick={() => void undoImport()}
                    disabled={undoing || refreshing || saving}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                  >
                    {undoing ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    Undo import
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-center text-[10px] font-semibold text-white/25 sm:text-left">
            Imported channels are stored in Focus Tube only.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              {summary ? 'Done' : 'Close'}
            </button>
            {loadResult && !summary && (
              <button
                type="button"
                onClick={() => void importSelected()}
                disabled={!selectedCount || saving || refreshing}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_10px_30px_-12px_rgba(229,9,20,0.9)] transition-colors hover:bg-primary/85 disabled:opacity-35 disabled:shadow-none"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                {saving ? 'Saving channels…' : `Import ${selectedCount} selected`}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}

export default ImportSubscriptions
