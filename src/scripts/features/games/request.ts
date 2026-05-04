import type { GameReleaseItem, GamesPlatform, GamesRange } from '../../../types/shared.ts'

type MockSeed = {
    id: string
    title: string
    daysFromNow: number
    platform: Exclude<GamesPlatform, 'all'>
    colors: [string, string]
}

const MOCK_RELEASES: MockSeed[] = [
    { id: 'project-atlas', title: 'Project Atlas', daysFromNow: 2, platform: 'pc', colors: ['#19446b', '#7fb6ff'] },
    {
        id: 'neon-district-dx',
        title: 'Neon District DX',
        daysFromNow: 4,
        platform: 'playstation',
        colors: ['#37153d', '#f05b8e'],
    },
    { id: 'sable-frontier', title: 'Sable Frontier', daysFromNow: 6, platform: 'xbox', colors: ['#163f20', '#8ddf7d'] },
    {
        id: 'starfall-rally',
        title: 'Starfall Rally',
        daysFromNow: 9,
        platform: 'nintendo',
        colors: ['#6a1d18', '#ff9a6b'],
    },
    {
        id: 'saltline-tactics',
        title: 'Saltline Tactics',
        daysFromNow: 12,
        platform: 'pc',
        colors: ['#1f3345', '#dfc684'],
    },
    {
        id: 'moonwake-zero',
        title: 'Moonwake Zero',
        daysFromNow: 16,
        platform: 'playstation',
        colors: ['#15244f', '#bda7ff'],
    },
    { id: 'glass-harbor', title: 'Glass Harbor', daysFromNow: 20, platform: 'xbox', colors: ['#15454d', '#78d5d0'] },
    {
        id: 'ember-circuit',
        title: 'Ember Circuit',
        daysFromNow: 26,
        platform: 'nintendo',
        colors: ['#4c1f11', '#ffce73'],
    },
    { id: 'archive-nine', title: 'Archive Nine', daysFromNow: 28, platform: 'pc', colors: ['#262d40', '#91a6d9'] },
    {
        id: 'rift-cartographers',
        title: 'Rift Cartographers',
        daysFromNow: 34,
        platform: 'playstation',
        colors: ['#24315f', '#76d5ff'],
    },
]

const RANGE_TO_DAYS: Record<GamesRange, number> = {
    '7d': 7,
    '14d': 14,
    '30d': 30,
}

export function getGameReleaseItems(range: GamesRange, platform: GamesPlatform, limit: number): GameReleaseItem[] {
    const maxDays = RANGE_TO_DAYS[range]

    return MOCK_RELEASES.filter((item) => {
        if (item.daysFromNow > maxDays) {
            return false
        }

        return platform === 'all' || item.platform === platform
    })
        .slice(0, limit)
        .map((item) => ({
            id: item.id,
            title: item.title,
            platform: formatPlatform(item.platform),
            releaseDate: createIsoDate(item.daysFromNow),
            cover: createCover(item.title, item.platform, item.colors),
        }))
}

function createIsoDate(daysFromNow: number): string {
    const date = new Date()
    date.setHours(12, 0, 0, 0)
    date.setDate(date.getDate() + daysFromNow)
    return date.toISOString()
}

function formatPlatform(platform: Exclude<GamesPlatform, 'all'>): string {
    if (platform === 'pc') {
        return 'PC'
    }

    if (platform === 'playstation') {
        return 'PlayStation'
    }

    if (platform === 'xbox') {
        return 'Xbox'
    }

    return 'Nintendo'
}

function createCover(title: string, platform: Exclude<GamesPlatform, 'all'>, colors: [string, string]): string {
    const initials = title
        .split(' ')
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() ?? '')
        .join('')

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 640">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors[0]}"/>
      <stop offset="100%" stop-color="${colors[1]}"/>
    </linearGradient>
  </defs>
  <rect width="480" height="640" fill="url(#g)"/>
  <circle cx="390" cy="110" r="120" fill="rgba(255,255,255,0.12)"/>
  <circle cx="120" cy="540" r="150" fill="rgba(0,0,0,0.16)"/>
  <text x="42" y="88" fill="rgba(255,255,255,0.72)" font-family="system-ui, sans-serif" font-size="28">${
        formatPlatform(platform)
    }</text>
  <text x="42" y="470" fill="#ffffff" font-family="system-ui, sans-serif" font-size="156" font-weight="700">${initials}</text>
  <text x="42" y="552" fill="rgba(255,255,255,0.9)" font-family="system-ui, sans-serif" font-size="38" font-weight="600">${
        escapeXml(title)
    }</text>
</svg>`

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`
}

function escapeXml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
