import React, { useState, useMemo } from 'react'
import { Megaphone, Search, Tag, CheckCircle2, ChevronDown, ChevronUp, Clock, Filter, ArrowUpRight, ShieldCheck, Wrench, Layers } from 'lucide-react'
import { APP_UPDATES, AppRelease, normalizeUpdate, ReleaseUpdateItem } from '../data/updates'

const Updates: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedVersion, setSelectedVersion] = useState<string>('all')
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>(() => {
    // Default: expand top 3 versions
    const initial: Record<string, boolean> = {}
    APP_UPDATES.slice(0, 3).forEach((rel) => {
      initial[rel.version] = true
    })
    return initial
  })

  const toggleExpand = (version: string) => {
    setExpandedVersions((prev) => ({
      ...prev,
      [version]: !prev[version]
    }))
  }

  const expandAll = () => {
    const next: Record<string, boolean> = {}
    APP_UPDATES.forEach((rel) => {
      next[rel.version] = true
    })
    setExpandedVersions(next)
  }

  const collapseAll = () => {
    setExpandedVersions({})
  }

  // Filtered releases based on search query and version filter
  const filteredReleases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return APP_UPDATES.filter((release) => {
      if (selectedVersion !== 'all' && release.version !== selectedVersion) {
        return false
      }

      if (!q) return true

      const versionMatch = release.version.toLowerCase().includes(q)
      const summaryMatch = release.summary ? release.summary.toLowerCase().includes(q) : false
      const updatesMatch = release.updates.some((item) => {
        const norm = normalizeUpdate(item)
        return (
          norm.title.toLowerCase().includes(q) ||
          (norm.description && norm.description.toLowerCase().includes(q)) ||
          (norm.category && norm.category.toLowerCase().includes(q))
        )
      })

      return versionMatch || summaryMatch || updatesMatch
    })
  }, [searchQuery, selectedVersion])

  const getCategoryColor = (category?: string) => {
    if (!category) return 'bg-white/5 text-white/50 border-white/10'
    const cat = category.toLowerCase()
    if (cat.includes('security') || cat.includes('privacy')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    }
    if (cat.includes('theater') || cat.includes('ui') || cat.includes('polish')) {
      return 'bg-pink-500/10 text-pink-400 border-pink-500/20'
    }
    if (cat.includes('focus') || cat.includes('youtube')) {
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    }
    if (cat.includes('stability') || cat.includes('core') || cat.includes('fix')) {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    }
    if (cat.includes('player') || cat.includes('playback')) {
      return 'bg-violet-500/10 text-violet-400 border-violet-500/20'
    }
    return 'bg-primary/10 text-primary border-primary/20'
  }

  const latestVersion = APP_UPDATES[0]?.version || 'v1.45.0'

  return (
    <div className="updates-page space-y-8 pb-16 font-sans">
      {/* Page Header */}
      <div className="updates-header flex flex-col md:flex-row md:items-center justify-between gap-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary border border-primary/20 shadow-lg shadow-primary/10">
            <Megaphone size={26} strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">
                Updates
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
                Current {latestVersion}
              </span>
            </div>
            <p className="text-white/40 font-medium text-xs mt-0.5">
              Release notes, improvements, and changes across every version
            </p>
          </div>
        </div>

        {/* Quick actions & stats */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={expandAll}
            className="updates-action-btn rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-all"
            title="Expand all versions"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="updates-action-btn rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-all"
            title="Collapse all versions"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="updates-search-box relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search updates (e.g. YouTube, ambient glow, 1.44.0, player, subtitles)..."
            className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-xs font-medium text-white placeholder:text-white/30 outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Version Dropdown Filter */}
        <div className="w-full sm:w-auto flex-shrink-0">
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="updates-version-select w-full sm:w-44 h-11 rounded-xl border border-white/10 bg-[#0e131d] px-3 text-xs font-semibold text-white/80 outline-none focus:border-primary/50 transition-all cursor-pointer"
          >
            <option value="all">All Releases ({APP_UPDATES.length})</option>
            {APP_UPDATES.slice(0, 20).map((r) => (
              <option key={r.version} value={r.version}>
                {r.version} {r.version === latestVersion ? '(Latest)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Release List */}
      {filteredReleases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-white/30 mb-4">
            <Search size={28} />
          </div>
          <h3 className="text-lg font-bold text-white">No updates matched your search</h3>
          <p className="text-xs text-white/40 mt-1 max-w-sm">
            Try searching for other keywords like "theater", "queue", "fix", or clear the search filter.
          </p>
          <button
            onClick={() => {
              setSearchQuery('')
              setSelectedVersion('all')
            }}
            className="mt-4 rounded-xl bg-primary/20 border border-primary/30 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/30 transition-all"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredReleases.map((release, index) => {
            const isLatest = release.version === latestVersion
            const isExpanded = searchQuery.trim().length > 0 || selectedVersion !== 'all' || Boolean(expandedVersions[release.version])
            const normalizedUpdates = release.updates.map((u) => normalizeUpdate(u))
            const updateCount = normalizedUpdates.length

            return (
              <div
                key={release.version}
                className={`updates-release-card relative overflow-hidden rounded-2xl border transition-all duration-200 ${
                  isLatest
                    ? 'is-latest border-primary/30 bg-gradient-to-b from-primary/[0.08] via-white/[0.02] to-[#070b11] shadow-[0_8px_30px_rgba(229,9,20,0.06)]'
                    : 'border-white/5 bg-[#0a0f18]/80 hover:border-white/10'
                }`}
              >
                {/* Header banner */}
                <div
                  onClick={() => toggleExpand(release.version)}
                  className="updates-release-header flex items-center justify-between p-5 cursor-pointer select-none gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className={`updates-release-version font-black text-lg sm:text-xl tracking-tight ${
                        isLatest ? 'text-primary' : 'text-white'
                      }`}
                    >
                      {release.version}
                    </span>

                    {isLatest && (
                      <span className="rounded-md border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                        Latest
                      </span>
                    )}

                    <span className="updates-count-badge rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/50">
                      {updateCount} {updateCount === 1 ? 'update' : 'updates'}
                    </span>

                    {release.date && (
                      <span className="updates-release-date hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-white/35">
                        <Clock size={12} />
                        {release.date}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-white/40 hidden sm:inline">
                      {isExpanded ? 'Hide' : 'View'}
                    </span>
                    <button
                      type="button"
                      className="updates-chevron-btn flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {/* Summary (always visible if available) */}
                {release.summary && (
                  <div className="updates-release-summary px-5 pb-3 -mt-1">
                    <p className="text-xs font-medium text-white/60 leading-relaxed">
                      {release.summary}
                    </p>
                  </div>
                )}

                {/* Collapsible Updates List */}
                {isExpanded && (
                  <div className="updates-list-container border-t border-white/5 bg-black/20 p-5 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {normalizedUpdates.map((update, uIdx) => (
                        <div
                          key={uIdx}
                          className="updates-item-card flex flex-col justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 hover:border-white/12 hover:bg-white/[0.04] transition-all"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <h4 className="updates-item-title text-xs font-bold text-white leading-snug">
                                {update.title}
                              </h4>
                              {update.category && (
                                <span
                                  className={`updates-category-badge shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getCategoryColor(
                                    update.category
                                  )}`}
                                >
                                  {update.category}
                                </span>
                              )}
                            </div>
                            {update.description && (
                              <p className="updates-item-desc text-[11px] font-medium leading-relaxed text-white/50">
                                {update.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default React.memo(Updates)
