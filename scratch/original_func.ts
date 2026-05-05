ipcMain.handle('search-torrent-sources', async (_, title: string, year: string, mediaType: string, tmdbId: number) => {
  try {
    console.log(`[Torrent] Searching sources for: "${title}" (${year}) type=${mediaType} tmdbId=${tmdbId}`)

    // 1. Fetch IMDB ID for both movies and series to ensure accurate matching
    let imdbId = ''
    try {
      const extUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
      const extData: any = await nodeHttpGet(extUrl)
      imdbId = extData?.imdb_id || ''
      console.log(`[Torrent] Got IMDB ID: ${imdbId}`)
    } catch (e) {
      console.error('[Torrent] Failed to get IMDB ID:', e)
    }

    const sources: any[] = []

    if (mediaType === 'movie') {
      // A. Fetch from YTS using IMDB ID for 100% accurate match (bypassing fuzzy title/year issues)
      if (imdbId) {
        const mirrors = ['yts.mx', 'yts.rs', 'yts.do', 'yts.lt', 'yts.ag']
        let ytsData: any = null

        for (const domain of mirrors) {
          try {
            // YTS supports full IMDB IDs starting with 'tt' as query_term!
            const searchUrl = `https://${domain}/api/v2/list_movies.json?query_term=${imdbId}&limit=10&sort_by=seeds`
            const res = await nodeHttpGet(searchUrl, 3000) 
            if (res?.status === 'ok' && res?.data?.movies?.length > 0) {
              ytsData = res
              break
            }
          } catch (err: any) {
            console.log(`[Torrent] YTS mirror ${domain} failed`)
          }
        }

        if (ytsData?.data?.movies) {
          for (const movie of ytsData.data.movies) {
            for (const torrent of (movie.torrents || [])) {
              const seeds = torrent.seeds || 0
              const peers = torrent.peers || 0
              if (seeds === 0 && peers === 0) continue // Skip dead torrents
              sources.push({
                title: `${movie.title_long} [${torrent.type?.toUpperCase() || 'WEB'}] (YTS)`,
                quality: torrent.quality || '720p',
                size: torrent.size || 'ΓÇö',
                magnet: `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(movie.title_long)}`,
                seeds,
                peers,
                type: torrent.type || 'web',
                isHindi: isHindiContent(movie.title_long || '')
              })
            }
          }
        }
      }

      // B. Fetch from Torrentio as an aggregator for high-speed, dual-audio, and hindi content
      if (imdbId) {
        try {
          const torrentioUrl = `${TORRENTIO_BASE}/stream/movie/${imdbId}.json`
          console.log(`[Torrent] Fetching Torrentio: ${torrentioUrl}`)
          const tData: any = await nodeHttpGet(torrentioUrl, 6000)
          if (tData && tData.streams) {
            for (const stream of tData.streams) {
              const parsed = parseTorrentioStream(stream, title)
              if (parsed) sources.push(parsed)
            }
          }
        } catch (err: any) {
          console.error('[Torrent] Torrentio fetch failed:', err.message)
        }
      }

    } else {
      // TV Series logic - using EZTV
      if (!imdbId) return []

      const imdbNumeric = imdbId.replace(/^tt/, '')
      const eztvMirrors = ['eztvx.to', 'eztv.re', 'eztv.wf', 'eztv.tf', 'eztv.yt']
      let data: any = null

      for (const domain of eztvMirrors) {
        try {
          const searchUrl = `https://${domain}/api/get-torrents?imdb_id=${imdbNumeric}&limit=30&page=1`
          const res = await nodeHttpGet(searchUrl, 5000)
          if (res && res.torrents) {
            data = res
            break
          }
        } catch (err: any) {
          console.log(`[Torrent] EZTV mirror ${domain} failed`)
        }
      }

      if (data?.torrents) {
        for (const t of data.torrents) {
          if (!t.magnet_url) continue
          const seeds = t.seeds || 0
          const peers = t.peers || 0
          if (seeds === 0 && peers === 0) continue // Skip dead torrents
          const torrentTitle = t.title || t.filename || 'Unknown'
          sources.push({
            title: torrentTitle,
            quality: torrentTitle.match(/(720p|1080p|2160p|480p)/i)?.[1] || 'SD',
            size: formatBytes(t.size_bytes || 0),
            magnet: t.magnet_url,
            seeds,
            peers,
            type: 'web',
            isHindi: isHindiContent(torrentTitle)
          })
        }
      }

      // D. Fetch from Torrentio for TV Series (aggregates many sources)
      if (imdbId) {
        try {
          // Fetch general series streams (Torrentio returns season packs + recent episodes)
          const torrentioUrl = `${TORRENTIO_BASE}/stream/series/${imdbId}.json`
          console.log(`[Torrent] Fetching Torrentio series: ${torrentioUrl}`)
          const tData: any = await nodeHttpGet(torrentioUrl, 6000)
          if (tData && tData.streams) {
            for (const stream of tData.streams) {
              const parsed = parseTorrentioStream(stream, title)
              if (parsed) sources.push(parsed)
            }
          }
        } catch (err: any) {
          console.error('[Torrent] Torrentio series fetch failed:', err.message)
        }
      }
    }

    // C. Fetch from APIBay (The Pirate Bay) for both movies and series
    if (imdbId) {
      try {
        const apibayUrl = `https://apibay.org/q.php?q=${imdbId}`
        const apiBayData: any = await nodeHttpGet(apibayUrl, 5000)
        
        if (Array.isArray(apiBayData) && apiBayData[0]?.id !== '0') {
          for (const t of apiBayData) {
            const seeders = parseInt(t.seeders) || 0
            const leechers = parseInt(t.leechers) || 0
            if (seeders === 0) continue // Skip dead torrents early
            
            const titleName = t.name || ''
            
            const qualityMatch = titleName.match(/(2160p|1080p|720p|480p)/i)
            const quality = qualityMatch ? qualityMatch[1] : 'HD'
            
            sources.push({
              title: `${titleName.substring(0, 80)} (TPB)`,
              quality: quality,
              size: formatBytes(parseInt(t.size) || 0),
              magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(titleName)}`,
              seeds: seeders,
              peers: leechers,
              type: 'web',
              isHindi: isHindiContent(titleName)
            })
          }
        }
      } catch (err: any) {
        console.error('[Torrent] APIBay fetch failed:', err.message)
      }
    }

    // E. Fetch from MediaFusion (Stremio addon ΓÇö indexes many Hindi/Dual audio sources)
    if (imdbId) {
      try {
        const mfType = mediaType === 'movie' ? 'movie' : 'series'
        const mfUrl = `https://mediafusion.elfhosted.com/stream/${mfType}/${imdbId}.json`
        console.log(`[Torrent] Fetching MediaFusion: ${mfUrl}`)
        const mfData: any = await nodeHttpGet(mfUrl, 6000)
        if (mfData && mfData.streams) {
          for (const stream of mfData.streams) {
            const parsed = parseTorrentioStream(stream, title) // Same stream format as Torrentio
            if (parsed) {
              parsed.title = parsed.title ? `${parsed.title}` : `${title} (MF)`
              sources.push(parsed)
            }
          }
          console.log(`[Torrent] MediaFusion returned ${mfData.streams.length} streams`)
        }
      } catch (err: any) {
        console.error('[Torrent] MediaFusion fetch failed:', err.message)
      }
    }

    // G. SolidTorrents: Excellent coverage for Indian/Hindi content
    try {
      const solidQueries = [
        mediaType === 'movie' ? `${title} ${year} Hindi` : `${title} Hindi`,
        `${title} Dual Audio`
      ]
      
      for (const q of solidQueries) {
        const solidUrl = `https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(q)}&category=all&sort=seeders`
        console.log(`[Torrent] Fetching SolidTorrents: ${solidUrl}`)
        const solidData: any = await nodeHttpGet(solidUrl, 5000)
        if (solidData && solidData.results) {
          for (const t of solidData.results) {
            const seeds = t.swarm?.seeders || 0
            if (seeds < 1) continue

            const titleName = t.title || ''
            if (!isRelevanceMatch(titleName, title, mediaType, year)) continue

            sources.push({
              title: `${titleName.substring(0, 80)} (Solid)`,
              quality: titleName.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
              size: formatBytes(t.size || 0),
              magnet: t.magnet || `magnet:?xt=urn:btih:${t.infoHash}&dn=${encodeURIComponent(titleName)}`,
              seeds,
              peers: t.swarm?.leechers || 0,
              type: 'web',
              isHindi: isHindiContent(titleName)
            })
          }
        }
      }
    } catch (err: any) {
      console.error('[Torrent] SolidTorrents fetch failed:', err.message)
    }

    // H. Bitsearch: Targeted multi-keyword search for Hindi sites (KatmovieHD, HDhub4u, etc.)
    const siteKeywords = [
      'Hindi', 'KatmovieHD', 'HDhub4u', 'Vegamovies', 'UHDmovies', 
      'Dotmovies', 'Bolly4u', 'Hdmovies4u', '1TamilMV', 'TamilMV', 
      'Moviesflix', 'Filmyzilla', 'Downloadhub', 'TamilBlasters', '7starhd'
    ]
    const queryYear = (mediaType === 'movie' && year) ? ` ${year}` : ''
    
    // Use a smaller batch size for parallel requests to avoid being blocked or timing out
    const keywordBatches = []
    const batchSize = 4
    for (let i = 0; i < siteKeywords.length; i += batchSize) {
      keywordBatches.push(siteKeywords.slice(i, i + batchSize))
    }

    for (const batch of keywordBatches) {
      await Promise.all(batch.map(async (keyword) => {
        try {
          const query = `${title}${queryYear} ${keyword}`
          const bitUrl = `https://bitsearch.to/search?q=${encodeURIComponent(query)}&sort=seeders`
          const html = await nodeHttpRequest(bitUrl, { timeoutMs: 8000 }) 
          if (typeof html === 'string') {
            // Robust regex for Bitsearch results
            const resultRegex = /<li class="search-result[\s\S]*?<h3 class="title">[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>[\s\S]*?<div class="stats">[\s\S]*?<div>[\s\S]*?([0-9.]+\s*[GMK]B)[\s\S]*?<div>[\s\S]*?([0-9,]+)[\s\S]*?<div>[\s\S]*?([0-9,]+)[\s\S]*?<a class="dl-magnet" href="([^"]+)"/g
            let match
            while ((match = resultRegex.exec(html)) !== null) {
              const [, , tTitle, tSize, tSeeds, tPeers, tMagnet] = match
              const cleanTitle = tTitle.trim()
              const seeds = parseInt(tSeeds.replace(/,/g, '')) || 0
              if (seeds < 1) continue
              if (!isRelevanceMatch(cleanTitle, title, mediaType, year)) continue

              sources.push({
                title: `${cleanTitle.substring(0, 80)} (Bit)`,
                quality: cleanTitle.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
                size: tSize.trim(),
                magnet: tMagnet,
                seeds,
                peers: parseInt(tPeers.replace(/,/g, '')) || 0,
                type: 'web',
                isHindi: isHindiContent(cleanTitle)
              })
            }
          }
        } catch (e) {}
      }))
    }

    // H2. 1337x: High-quality results often including Hindi/Dual-Audio
    try {
      const x1337Mirrors = ['1337x.to', '1337x.st', 'x1337x.ws']
      const xQuery = mediaType === 'movie' ? `${title} ${year} Hindi` : `${title} Hindi`
      
      for (const domain of x1337Mirrors) {
        try {
          const xUrl = `https://${domain}/sort-search/${encodeURIComponent(xQuery)}/seeders/desc/1/`
          const html = await nodeHttpRequest(xUrl, { timeoutMs: 6000 })
          if (typeof html === 'string') {
            // Regex for 1337x search results table
            const rowRegex = /<td class="coll-1 name">[\s\S]*?<a href="\/torrent\/(\d+)\/([^/]+)\/">([^<]+)<\/a>[\s\S]*?<td class="coll-2 seeds">(\d+)<\/td>[\s\S]*?<td class="coll-3 leeches">(\d+)<\/td>[\s\S]*?<td class="coll-4 size">([^<]+)<span/g
            let match
            const torrentsToFetch = []
            while ((match = rowRegex.exec(html)) !== null) {
              const [ , tId, tSlug, tTitle, tSeeds, tLeeches, tSize] = match
              const seeds = parseInt(tSeeds) || 0
              if (seeds < 1) continue
              if (!isRelevanceMatch(tTitle, title, mediaType, year)) continue
              
              torrentsToFetch.push({ id: tId, slug: tSlug, title: tTitle, seeds, peers: parseInt(tLeeches) || 0, size: tSize.trim() })
              if (torrentsToFetch.length >= 5) break // Limit to top 5 for speed
            }

            // Fetch magnets for the top results (1337x requires a separate page load for magnet)
            await Promise.all(torrentsToFetch.map(async (t) => {
              try {
                const detailUrl = `https://${domain}/torrent/${t.id}/${t.slug}/`
                const detailHtml = await nodeHttpRequest(detailUrl, { timeoutMs: 5000 })
                const magnetMatch = detailHtml.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/)
                if (magnetMatch) {
                  sources.push({
                    title: `${t.title.substring(0, 80)} (1337x)`,
                    quality: t.title.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
                    size: t.size,
                    magnet: magnetMatch[1],
                    seeds: t.seeds,
                    peers: t.peers,
                    type: 'web',
                    isHindi: isHindiContent(t.title)
                  })
                }
              } catch (e) {}
            }))
            
            if (torrentsToFetch.length > 0) break // Success, don't try other mirrors
          }
        } catch (e) {}
      }
    } catch (err: any) {}

    // I. Secondary Search: Title-based search on APIBay for Hindi content
    try {
      const searchTitle = `${title}${queryYear} Hindi`
      const apibayTitleUrl = `https://apibay.org/q.php?q=${encodeURIComponent(searchTitle)}`
      const apiBayData: any = await nodeHttpGet(apibayTitleUrl, 5000)
      
      if (Array.isArray(apiBayData) && apiBayData[0]?.id !== '0') {
        for (const t of apiBayData) {
          const seeders = parseInt(t.seeders) || 0
          if (seeders < 1) continue
          
          const titleName = t.name || ''
          if (isHindiContent(titleName) && isRelevanceMatch(titleName, title, mediaType, year)) {
            sources.push({
              title: `${titleName.substring(0, 80)} (TPB-HI)`,
              quality: titleName.match(/(2160p|1080p|720p|480p)/i)?.[1] || 'HD',
              size: formatBytes(parseInt(t.size) || 0),
              magnet: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(titleName)}`,
              seeds: seeders,
              peers: parseInt(t.leechers) || 0,
              type: 'web',
              isHindi: true
            })
          }
        }
      }
    } catch (err: any) {}

    // J. Dedicated Hindi/Dubbed Aggregators (KnightCrawler)
    if (imdbId) {
      try {
        const kcUrl = `https://knightcrawler.elfhosted.com/stream/${mediaType === 'movie' ? 'movie' : 'series'}/${imdbId}.json`
        const kcData: any = await nodeHttpGet(kcUrl, 6000)
        if (kcData && kcData.streams) {
          for (const stream of kcData.streams) {
            if (isHindiContent(stream.title || '')) {
              const parsed = parseTorrentioStream(stream, title)
              if (parsed) {
                parsed.title = `${parsed.title} (KC)`
                sources.push(parsed)
              }
            }
          }
        }
      } catch (err: any) {}
    }

    // Parse Season / Episode metadata
    let enrichedSources = sources.map(src => {
      if (mediaType === 'tv') {
        const titleLower = src.title.toLowerCase()
        const seMatch = titleLower.match(/s(\d{1,2})e(\d{1,2})/i) || titleLower.match(/season\s*(\d{1,2})\s*episode\s*(\d{1,2})/i)
        
        if (seMatch) {
          src.parsedSeason = parseInt(seMatch[1])
          src.parsedEpisode = parseInt(seMatch[2])
          src.isSeasonPack = false
        } else {
          const sMatch = titleLower.match(/s(\d{1,2})\b/i) || titleLower.match(/season\s*(\d{1,2})\b/i)
          if (sMatch) {
            src.parsedSeason = parseInt(sMatch[1])
            src.isSeasonPack = true
          }
        }
      }
      return src
    })

    // Filter Season Packs that are not 1080p+
    if (mediaType === 'tv') {
      enrichedSources = enrichedSources.filter(src => {
        if (src.isSeasonPack) {
          if (src.quality === 'SD' || src.quality === '480p' || src.quality === '720p') {
            return false
          }
        }
        return true
      })
    }

    // Sort heavily by requirements ΓÇö Hindi content and premium sites prioritized
    enrichedSources.sort((a, b) => {
      const scoreA = getHindiScore(a.title)
      const scoreB = getHindiScore(b.title)

      if (mediaType === 'movie') {
        // Priority 1: Hindi Score (includes site priority)
        if (scoreA !== scoreB) return scoreB - scoreA
        
        // Priority 2: Seeds
        return b.seeds - a.seeds
      } else {
        // TV Series logic
        // Both are Season Packs
        if (a.isSeasonPack && b.isSeasonPack) {
          if (a.parsedSeason !== b.parsedSeason) return (a.parsedSeason || 0) - (b.parsedSeason || 0)
          
          // Same season pack: Hindi score first
          if (scoreA !== scoreB) return scoreB - scoreA
          return b.seeds - a.seeds
        }
        
        // Pack vs Episode
        if (a.isSeasonPack && !b.isSeasonPack) return -1
        if (!a.isSeasonPack && b.isSeasonPack) return 1

        // Both are Episodes
        if (a.parsedSeason !== b.parsedSeason) return (a.parsedSeason || 0) - (b.parsedSeason || 0)
        if (a.parsedEpisode !== b.parsedEpisode) return (a.parsedEpisode || 0) - (b.parsedEpisode || 0)
        
        // Same Episode: Hindi score first, then seeds
        if (scoreA !== scoreB) return scoreB - scoreA
        if (a.seeds !== b.seeds) return b.seeds - a.seeds
        
        // Tiebreaker: Resolution
        const qA = a.quality === '2160p' ? 3 : a.quality === '1080p' ? 2 : a.quality === '720p' ? 1 : 0
        const qB = b.quality === '2160p' ? 3 : b.quality === '1080p' ? 2 : b.quality === '720p' ? 1 : 0
        return qB - qA
      }
    })

    // Deduplicate by infoHash/magnet to avoid clutter
    const uniqueSources: any[] = []
    const seenHashes = new Set()
    for (const src of enrichedSources) {
      const match = src.magnet.match(/urn:btih:([a-zA-Z0-9]+)/i)
      const hash = match ? match[1].toLowerCase() : src.magnet
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash)
        uniqueSources.push(src)
      }
    }

    return uniqueSources
      .map(src => ({ ...src, magnet: enrichMagnetWithTrackers(src.magnet) }))

  } catch (err) {
    console.error('[Torrent] Source search error:', err)
    return []
  }
})

// ΓöÇΓöÇΓöÇ IPC: Start Torrent Download ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

