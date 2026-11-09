# Lumen

A modern fullscreen now-playing view for [Spicetify](https://spicetify.app), inspired by daksh2k's Fullscreen extension.

## Features

- Three layouts: Split (cover + lyrics), Cover, Lyrics
- Dynamic background (animated color blobs from the cover), blurred cover or solid color
- Synced lyrics with click-to-seek, from Spotify with LRCLIB as fallback
- Works alongside Beautiful Lyrics
- Up next, playing-from context, seek bar, volume, shuffle, repeat, like
- Optional clock, auto-hiding controls, real fullscreen window
- Settings panel (right-click anywhere or the gear icon), persisted locally

## Shortcuts

| Key | Action |
| --- | --- |
| `F` | Open / close Lumen |
| `L` | Toggle lyrics |
| `Esc` | Close |

## Install

### Marketplace

Search for **Lumen** in the Spicetify Marketplace (extensions tab).

### Manual

Copy `lumen.js` to your Spicetify `Extensions` folder (`%appdata%\spicetify\Extensions` on Windows), then:

```
spicetify config extensions lumen.js
spicetify apply
```

## License

MIT
