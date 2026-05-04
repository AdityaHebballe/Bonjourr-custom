import { tradThis } from '../../utils/translations.ts'

import type { GameReleaseItem } from '../../../types/shared.ts'

const list = document.getElementById('games_list')

export function displayGames(items: GameReleaseItem[]): void {
    if (!list) {
        return
    }

    list.textContent = ''

    if (items.length === 0) {
        displayGamesMessage(tradThis('No upcoming releases.'), 'games-empty')
        return
    }

    for (const release of items) {
        const item = document.createElement('li')
        const cover = release.cover ? document.createElement('img') : document.createElement('div')
        const coverUrl = release.cover
        const body = document.createElement('div')
        const title = document.createElement('span')
        const meta = document.createElement('span')
        const date = document.createElement('span')

        item.className = 'games-item'
        cover.className = 'games-item-cover'
        body.className = 'games-item-body'
        title.className = 'games-item-title'
        meta.className = 'games-item-meta'
        date.className = 'games-item-date'

        if (cover instanceof HTMLImageElement && coverUrl) {
            cover.src = coverUrl
            cover.alt = ''
            cover.decoding = 'async'
        }

        title.textContent = release.title
        meta.textContent = release.platform
        date.textContent = formatDate(release.releaseDate)

        body.append(title, meta, date)
        item.append(cover, body)
        list.appendChild(item)
    }
}

export function displayGamesLoading(): void {
    displayGamesMessage(tradThis('Loading upcoming releases...'), 'games-loading')
}

export function displayGamesError(): void {
    displayGamesMessage(tradThis('Game releases are unavailable right now.'), 'games-error')
}

export function displayGamesSetup(): void {
    displayGamesMessage(tradThis('Add your IGDB credentials in settings.'), 'games-error')
}

function displayGamesMessage(text: string, className: string): void {
    if (!list) {
        return
    }

    list.textContent = ''

    const item = document.createElement('li')
    item.className = className
    item.textContent = text
    list.appendChild(item)
}

function formatDate(value: string): string {
    const date = new Date(value)

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
    }).format(date)
}
