import { displayGames, displayGamesError, displayGamesLoading, displayGamesSetup } from './display.ts'
import { requestGameReleaseItems } from './request.ts'
import { eventDebounce } from '../../utils/debounce.ts'
import { storage } from '../../storage.ts'

import type { Games } from '../../../types/sync.ts'
import type { GamesLimit, GamesPlatform, GamesQuery, GamesRange } from '../../../types/shared.ts'

type GamesEvent = {
    on?: boolean
    range?: string
    platform?: string
    limit?: string
}

const container = document.getElementById('games_container')
let currentRender = 0

export function games(init?: Games, event?: GamesEvent): void {
    if (event) {
        updateGames(event)
        return
    }

    if (!init) {
        return
    }

    void renderGames(init)
}

async function updateGames(event: GamesEvent): Promise<void> {
    const games = (await storage.sync.get('games'))?.games

    if (!games) {
        return
    }

    if (typeof event.on === 'boolean') {
        games.on = event.on
    }

    if (isGamesRange(event.range)) {
        games.range = event.range
    }

    if (isGamesPlatform(event.platform)) {
        games.platform = event.platform
    }

    if (isGamesLimit(event.limit)) {
        games.limit = Number.parseInt(event.limit) as GamesLimit
    }

    await renderGames(games)
    eventDebounce({ games })
}

async function renderGames(config: Games): Promise<void> {
    const renderId = ++currentRender

    handleToggle(config.on)

    if (!config.on) {
        return
    }

    const query: GamesQuery = {
        range: config.range,
        platform: config.platform,
        limit: config.limit,
    }

    displayGamesLoading()

    try {
        const local = await storage.local.get([
            'gamesCache',
            'igdbClientId',
            'igdbClientSecret',
            'igdbAccessToken',
            'igdbAccessTokenExpiresAt',
        ])
        const hasCredentials = !!local.igdbClientId && !!local.igdbClientSecret

        if (!hasCredentials) {
            if (renderId !== currentRender) {
                return
            }

            displayGamesSetup()
            return
        }

        const { items, local: localPatch } = await requestGameReleaseItems(query, local)

        if (Object.keys(localPatch).length > 0) {
            storage.local.set(localPatch)
        }

        if (renderId !== currentRender) {
            return
        }

        displayGames(items)
    } catch (_error) {
        if (renderId !== currentRender) {
            return
        }

        displayGamesError()
    }
}

function handleToggle(state: boolean): void {
    container?.classList.toggle('hidden', !state)
}

function isGamesRange(value = ''): value is GamesRange {
    return value === '7d' || value === '14d' || value === '30d'
}

function isGamesPlatform(value = ''): value is GamesPlatform {
    return value === 'all' || value === 'pc' || value === 'playstation' || value === 'xbox' || value === 'nintendo'
}

function isGamesLimit(value = ''): value is `${GamesLimit}` {
    return value === '3' || value === '5' || value === '10'
}
