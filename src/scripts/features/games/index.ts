import { displayGames } from './display.ts'
import { getGameReleaseItems } from './request.ts'
import { eventDebounce } from '../../utils/debounce.ts'
import { storage } from '../../storage.ts'

import type { Games } from '../../../types/sync.ts'
import type { GamesLimit, GamesPlatform, GamesRange } from '../../../types/shared.ts'

type GamesEvent = {
    on?: boolean
    range?: string
    platform?: string
    limit?: string
}

const container = document.getElementById('games_container')

export function games(init?: Games, event?: GamesEvent): void {
    if (event) {
        updateGames(event)
        return
    }

    if (!init) {
        return
    }

    renderGames(init)
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

    renderGames(games)
    eventDebounce({ games })
}

function renderGames(config: Games): void {
    handleToggle(config.on)

    if (!config.on) {
        return
    }

    const items = getGameReleaseItems(config.range, config.platform, config.limit)
    displayGames(items)
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
