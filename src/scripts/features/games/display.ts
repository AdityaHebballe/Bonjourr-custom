import { tradThis } from '../../utils/translations.ts'

import type { GameReleaseItem } from '../../../types/shared.ts'

const list = document.getElementById('games_list')

export function displayGames(items: GameReleaseItem[]): void {
    if (!list) {
        return
    }

    list.textContent = ''

    if (items.length === 0) {
        const item = document.createElement('li')
        item.className = 'games-empty'
        item.textContent = tradThis('No upcoming releases in this range.')
        list.appendChild(item)
        return
    }

    for (const release of items) {
        const item = document.createElement('li')
        const cover = document.createElement('img')
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

        cover.src = release.cover ?? ''
        cover.alt = ''
        cover.decoding = 'async'

        title.textContent = release.title
        meta.textContent = release.platform
        date.textContent = formatDate(release.releaseDate)

        body.append(title, meta, date)
        item.append(cover, body)
        list.appendChild(item)
    }
}

function formatDate(value: string): string {
    const date = new Date(value)

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
    }).format(date)
}
