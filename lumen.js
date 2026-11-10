// Lumen - a fullscreen now-playing view for Spicetify
// https://github.com/vxnsin/spicetify-lumen

(function Lumen() {
    if (!(Spicetify?.Player && Spicetify?.Platform && Spicetify?.CosmosAsync && Spicetify?.Topbar)) {
        setTimeout(Lumen, 300);
        return;
    }

    const VERSION = "1.0.0";
    const KEY = "lumen:settings";

    const DEFAULTS = {
        layout: "split", // split | center | lyrics
        background: "dynamic", // dynamic | cover | solid
        blur: 60,
        brightness: 55,
        artMode: "canvas", // cover | canvas
        canvasBackground: false,
        lyrics: true,
        lyricsSize: 100,
        lyricsAlign: "left",
        showUpNext: true,
        showContext: true,
        showVolume: true,
        showClock: false,
        showExtraInfo: true,
        autoHide: true,
        nativeFullscreen: true,
        beautifulLyrics: true,
    };

    const load = () => {
        try {
            return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
        } catch {
            return { ...DEFAULTS };
        }
    };
    const cfg = load();
    const save = () => {
        try {
            localStorage.setItem(KEY, JSON.stringify(cfg));
        } catch {}
    };

    const P = Spicetify.Player;
    const state = {
        open: false,
        lyrics: null, // { synced: bool, lines: [{t, text}] }
        lyricsFor: null,
        active: -1,
        color: [30, 215, 96],
        color2: [80, 60, 160],
        raf: 0,
        hideTimer: 0,
        seeking: false,
    };

    // ---------- helpers ----------
    const $ = (sel, root = document) => root.querySelector(sel);
    const el = (tag, cls, html) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    };
    const esc = (s) =>
        String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const fmt = (ms) => {
        const s = Math.max(0, Math.floor(ms / 1000));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    const imgUrl = (u) => {
        if (!u) return "";
        if (u.startsWith("spotify:image:")) return "https://i.scdn.co/image/" + u.slice(14);
        return u;
    };
    const trackMeta = (t = P.data?.item) => {
        const m = t?.metadata || {};
        return {
            uri: t?.uri,
            title: t?.name || m.title || "",
            artist: (t?.artists || []).map((a) => a.name).join(", ") || m.artist_name || "",
            album: t?.album?.name || m.album_title || "",
            cover: imgUrl(m.image_xlarge_url || m.image_large_url || t?.album?.images?.[0]?.url || ""),
            duration: Number(t?.duration?.milliseconds ?? m.duration ?? P.getDuration() ?? 0),
        };
    };
    const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    // ---------- styles ----------
    const css = `
#lumen{position:fixed;inset:0;z-index:99999;display:none;color:#fff;font-family:var(--font-family,"Circular Std","Inter",system-ui,sans-serif);overflow:hidden;background:#0a0a0a;--c1:30,215,96;--c2:80,60,160;--lsize:1}
#lumen.open{display:block;animation:lumen-in .35s cubic-bezier(.2,.8,.2,1)}
@keyframes lumen-in{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:none}}
#lumen *{box-sizing:border-box}
#lumen .lm-bg{position:absolute;inset:0;transition:opacity .8s}
#lumen .lm-cover{position:absolute;inset:-10%;background-size:cover;background-position:center;transform:scale(1.15);transition:background-image .6s}
#lumen .lm-blob{position:absolute;width:70vmax;height:70vmax;border-radius:50%;filter:blur(40px);opacity:.75;mix-blend-mode:screen;will-change:transform;transition:background .9s}
#lumen .lm-blob.a{left:-20vmax;top:-25vmax;background:radial-gradient(circle,rgba(var(--c1),.9),transparent 65%);animation:lm-a 26s ease-in-out infinite alternate}
#lumen .lm-blob.b{right:-25vmax;bottom:-30vmax;background:radial-gradient(circle,rgba(var(--c2),.9),transparent 65%);animation:lm-b 32s ease-in-out infinite alternate}
@keyframes lm-a{to{transform:translate(35vmax,25vmax) scale(1.2)}}
@keyframes lm-b{to{transform:translate(-30vmax,-20vmax) scale(.85)}}
#lumen .lm-shade{position:absolute;inset:0;background:#000}
#lumen .lm-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,.55))}
#lumen .lm-grain{position:absolute;inset:0;opacity:.05;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}

#lumen .lm-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:28px 36px;z-index:5;transition:opacity .4s}
#lumen .lm-ctx{font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;display:flex;flex-direction:column;gap:2px}
#lumen .lm-ctx b{font-size:14px;letter-spacing:.02em;text-transform:none;opacity:1;font-weight:700}
#lumen .lm-clock{font-size:42px;font-weight:300;letter-spacing:.02em;opacity:.85;font-variant-numeric:tabular-nums}
#lumen .lm-btns{display:flex;gap:6px}
#lumen button{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;transition:background .2s,transform .15s,opacity .2s,color .2s}
#lumen .lm-ib{width:40px;height:40px;opacity:.75}
#lumen .lm-ib:hover{opacity:1;background:rgba(255,255,255,.14)}
#lumen .lm-ib:active{transform:scale(.92)}
#lumen .lm-ib.on{color:rgb(var(--c1));opacity:1}
#lumen svg{width:20px;height:20px;fill:currentColor}

#lumen .lm-main{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:6vw;padding:96px 6vw 170px}
#lumen.layout-center .lm-lyrics-wrap{display:none}
#lumen.layout-lyrics .lm-art-wrap{width:30vw;max-width:360px}
#lumen.layout-lyrics .lm-main{justify-content:flex-start;gap:5vw;padding-left:8vw}
#lumen.no-lyrics .lm-lyrics-wrap{display:none}
#lumen .lm-art-wrap{flex:0 0 auto;width:min(42vw,62vh);display:flex;flex-direction:column;gap:26px;transition:width .5s cubic-bezier(.2,.8,.2,1)}
#lumen .lm-art{position:relative;aspect-ratio:1;border-radius:14px;background:#222 center/cover;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 120px -10px rgba(var(--c1),.45);transition:box-shadow .8s}
#lumen .lm-art video,#lumen .lm-bgvideo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;opacity:0;transition:opacity .6s;pointer-events:none}
#lumen .lm-art video.show,#lumen .lm-bgvideo.show{opacity:1}
#lumen .lm-bgvideo{border-radius:0;filter:brightness(.9)}
#lumen .lm-art::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
#lumen.paused .lm-art{transform:scale(.94)}
#lumen .lm-art{transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .8s}
#lumen .lm-meta{display:flex;flex-direction:column;gap:4px;min-width:0}
#lumen .lm-title{font-size:clamp(22px,2.6vw,38px);font-weight:800;letter-spacing:-.02em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lumen .lm-artist{font-size:clamp(15px,1.5vw,21px);opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lumen .lm-album{font-size:13px;opacity:.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lumen.layout-center .lm-meta{text-align:center}
#lumen.layout-center .lm-art-wrap{width:min(48vh,70vw)}

#lumen .lm-lyrics-wrap{flex:1 1 0;min-width:0;height:100%;position:relative;-webkit-mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent)}
#lumen .lm-lyrics{position:absolute;inset:0;overflow-y:auto;scrollbar-width:none;padding:40vh 0;scroll-behavior:smooth}
#lumen .lm-lyrics::-webkit-scrollbar{display:none}
#lumen .lm-line{font-size:calc(clamp(26px,3.3vw,52px) * var(--lsize));font-weight:800;letter-spacing:-.02em;line-height:1.18;padding:.28em .4em;margin:0 -.4em;border-radius:14px;cursor:pointer;opacity:.28;filter:blur(var(--lb,2px));transform-origin:left center;transform:scale(.94);transition:opacity .45s,filter .45s,transform .5s cubic-bezier(.2,.8,.2,1),background .2s}
#lumen.align-center .lm-line{text-align:center;transform-origin:center}
#lumen.align-right .lm-line{text-align:right;transform-origin:right center}
#lumen .lm-line:hover{background:rgba(255,255,255,.07);opacity:.6}
#lumen .lm-line.past{opacity:.38}
#lumen .lm-line.active{opacity:1;filter:none;transform:scale(1);text-shadow:0 0 40px rgba(var(--c1),.5)}
#lumen .lm-line.empty{height:1.2em;padding:0}
#lumen .lm-line.dots{font-size:.7em}
#lumen .lm-static .lm-line{opacity:.85;filter:none;transform:none;cursor:default}
#lumen .lm-nolyrics{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;opacity:.5}

#lumen .lm-bottom{position:absolute;left:0;right:0;bottom:0;padding:0 6vw 34px;display:flex;flex-direction:column;gap:14px;z-index:5;transition:opacity .4s,transform .4s}
#lumen .lm-prog{display:flex;align-items:center;gap:14px;font-size:12px;font-variant-numeric:tabular-nums;opacity:.9}
#lumen .lm-bar{flex:1;height:18px;display:flex;align-items:center;cursor:pointer;position:relative}
#lumen .lm-bar i{display:block;width:100%;height:5px;border-radius:5px;background:rgba(255,255,255,.2);overflow:hidden;transition:height .15s}
#lumen .lm-bar:hover i{height:8px}
#lumen .lm-bar b{display:block;height:100%;width:0;background:#fff;border-radius:5px}
#lumen .lm-bar:hover b{background:rgb(var(--c1))}
#lumen .lm-row{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px}
#lumen .lm-next{display:flex;align-items:center;gap:12px;min-width:0;opacity:.85}
#lumen .lm-next img{width:44px;height:44px;border-radius:6px;object-fit:cover;background:#222}
#lumen .lm-next div{min-width:0;display:flex;flex-direction:column}
#lumen .lm-next small{font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.6}
#lumen .lm-next span{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lumen .lm-next em{font-style:normal;font-size:12px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lumen .lm-ctrl{display:flex;align-items:center;gap:14px}
#lumen .lm-ctrl .lm-ib{width:44px;height:44px}
#lumen .lm-play{width:64px!important;height:64px!important;background:#fff;color:#000;opacity:1!important}
#lumen .lm-play:hover{transform:scale(1.07);background:#fff!important}
#lumen .lm-play svg{width:26px;height:26px}
#lumen .lm-right{display:flex;justify-content:flex-end;align-items:center;gap:8px}
#lumen .lm-vol{width:110px;height:18px;display:flex;align-items:center;cursor:pointer}
#lumen .lm-vol i{display:block;width:100%;height:4px;border-radius:4px;background:rgba(255,255,255,.2);overflow:hidden}
#lumen .lm-vol b{display:block;height:100%;background:#fff;border-radius:4px}
#lumen.idle{cursor:none}
#lumen.idle .lm-top,#lumen.idle .lm-bottom{opacity:0;pointer-events:none}
#lumen.idle .lm-bottom{transform:translateY(14px)}

#lumen .lm-settings{position:absolute;top:80px;right:36px;width:320px;max-height:calc(100vh - 120px);overflow:auto;background:rgba(20,20,20,.82);backdrop-filter:blur(30px);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:18px;z-index:10;display:none;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#lumen .lm-settings.show{display:flex;animation:lumen-in .2s}
#lumen .lm-settings h3{margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.6}
#lumen .lm-set{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px}
#lumen .lm-set.col{flex-direction:column;align-items:stretch}
#lumen .lm-set input[type=range]{width:100%;accent-color:rgb(var(--c1))}
#lumen .lm-seg{display:flex;background:rgba(255,255,255,.08);border-radius:10px;padding:3px}
#lumen .lm-seg button{flex:1;border-radius:8px;padding:6px 8px;font-size:12px;justify-content:center;opacity:.7}
#lumen .lm-seg button.on{background:rgba(255,255,255,.18);opacity:1}
#lumen .lm-tg{width:38px;height:22px;border-radius:12px;background:rgba(255,255,255,.2);position:relative;flex:none}
#lumen .lm-tg::after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}
#lumen .lm-tg.on{background:rgb(var(--c1))}
#lumen .lm-tg.on::after{transform:translateX(16px)}
#lumen .lm-ver{font-size:11px;opacity:.4;text-align:center}
@media (max-width:900px){#lumen .lm-art-wrap{display:none}#lumen .lm-next{display:none}#lumen .lm-vol{display:none}}
`;

    const icons = {
        full: '<svg viewBox="0 0 16 16" width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round"><path d="M2 5.5V3.5A1.5 1.5 0 0 1 3.5 2h2M10.5 2h2A1.5 1.5 0 0 1 14 3.5v2M14 10.5v2a1.5 1.5 0 0 1-1.5 1.5h-2M5.5 14h-2A1.5 1.5 0 0 1 2 12.5v-2"/><circle cx="8" cy="8" r="2.2" style="fill:currentColor;stroke:none"/></svg>',
        close: '<svg viewBox="0 0 16 16"><path d="M2.47 2.47a.75.75 0 0 1 1.06 0L8 6.94l4.47-4.47a.75.75 0 1 1 1.06 1.06L9.06 8l4.47 4.47a.75.75 0 1 1-1.06 1.06L8 9.06l-4.47 4.47a.75.75 0 0 1-1.06-1.06L6.94 8 2.47 3.53a.75.75 0 0 1 0-1.06z"/></svg>',
        gear: '<svg viewBox="0 0 16 16"><path d="M8 0a1 1 0 0 0-1 1v.6a5.5 5.5 0 0 0-1.4.6l-.4-.4a1 1 0 0 0-1.4 1.4l.4.4A5.5 5.5 0 0 0 3.6 5H3a1 1 0 0 0 0 2h.6c.1.5.3 1 .6 1.4l-.4.4a1 1 0 1 0 1.4 1.4l.4-.4c.4.3.9.5 1.4.6V11a1 1 0 0 0 2 0v-.6c.5-.1 1-.3 1.4-.6l.4.4a1 1 0 0 0 1.4-1.4l-.4-.4c.3-.4.5-.9.6-1.4h.6a1 1 0 0 0 0-2h-.6a5.5 5.5 0 0 0-.6-1.4l.4-.4a1 1 0 0 0-1.4-1.4l-.4.4A5.5 5.5 0 0 0 9 1.6V1a1 1 0 0 0-1-1zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" fill-rule="evenodd" transform="translate(0 2.5)"/></svg>',
        lyrics: '<svg viewBox="0 0 16 16"><path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797zM10.5 8.118l-2.619-2.62A63303.13 63303.13 0 0 0 4.74 9.075L2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.06-2.688 3.56-3.129zM7.12 4.094a4.331 4.331 0 1 1 4.786 4.786l-3.974 3.493-3.06 2.689a2.787 2.787 0 0 1-3.933-3.933l2.676-3.045 3.505-3.99z"/></svg>',
        prev: '<svg viewBox="0 0 16 16"><path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h1.6z"/></svg>',
        next: '<svg viewBox="0 0 16 16"><path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-1.6z"/></svg>',
        play: '<svg viewBox="0 0 16 16"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>',
        pause: '<svg viewBox="0 0 16 16"><path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z"/></svg>',
        shuffle: '<svg viewBox="0 0 16 16"><path d="M13.151.922a.75.75 0 1 0-1.06 1.06L13.109 3H11.16a3.75 3.75 0 0 0-2.873 1.34l-6.173 7.356A2.25 2.25 0 0 1 .39 12.5H0V14h.391a3.75 3.75 0 0 0 2.873-1.34l6.173-7.356a2.25 2.25 0 0 1 1.724-.804h1.947l-1.017 1.018a.75.75 0 0 0 1.06 1.06L15.98 3.75 13.15.922zM.391 3.5H0V2h.391c1.109 0 2.16.49 2.873 1.34L4.89 5.277l-.979 1.167-1.796-2.14A2.25 2.25 0 0 0 .39 3.5z"/><path d="m7.5 10.723.98-1.167.957 1.14a2.25 2.25 0 0 0 1.724.804h1.947l-1.017-1.018a.75.75 0 1 1 1.06-1.06l2.829 2.828-2.829 2.828a.75.75 0 1 1-1.06-1.06L13.109 13H11.16a3.75 3.75 0 0 1-2.873-1.34l-.787-.938z"/></svg>',
        repeat: '<svg viewBox="0 0 16 16"><path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75v-5z"/></svg>',
        heart: '<svg viewBox="0 0 16 16"><path d="M15.724 4.22A4.313 4.313 0 0 0 12.192.814a4.269 4.269 0 0 0-3.622 1.13.837.837 0 0 1-1.14 0 4.272 4.272 0 0 0-6.21 5.855l5.916 7.05a1.128 1.128 0 0 0 1.727 0l5.916-7.05a4.228 4.228 0 0 0 .945-3.577z"/></svg>',
        heartO: '<svg viewBox="0 0 16 16"><path d="M1.69 2A4.582 4.582 0 0 1 8 2.023 4.583 4.583 0 0 1 11.88.817h.002a4.618 4.618 0 0 1 3.782 3.65v.003a4.543 4.543 0 0 1-1.011 3.84L9.35 14.629a1.765 1.765 0 0 1-2.093.464 1.762 1.762 0 0 1-.605-.463L1.348 8.309A4.582 4.582 0 0 1 1.689 2zm3.158.252A3.082 3.082 0 0 0 2.49 7.337l.005.005L7.8 13.664a.264.264 0 0 0 .311.069.262.262 0 0 0 .09-.069l5.312-6.33a3.043 3.043 0 0 0 .68-2.573 3.118 3.118 0 0 0-2.551-2.463 3.079 3.079 0 0 0-2.612.816l-.007.007a1.501 1.501 0 0 1-2.045 0l-.009-.008a3.082 3.082 0 0 0-2.121-.861z"/></svg>',
        vol: '<svg viewBox="0 0 16 16"><path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.642 3.642 0 0 1-1.33-4.967 3.639 3.639 0 0 1 1.33-1.332l6.925-4a.75.75 0 0 1 .75 0zm-6.924 5.3a2.139 2.139 0 0 0 0 3.7l5.8 3.35V2.8l-5.8 3.35zm8.683 4.29V5.56a2.75 2.75 0 0 1 0 4.88z"/></svg>',
    };

    // ---------- DOM ----------
    const root = el("div");
    root.id = "lumen";
    root.innerHTML = `
<div class="lm-bg">
  <div class="lm-cover"></div><video class="lm-bgvideo" muted loop playsinline></video><div class="lm-blob a"></div><div class="lm-blob b"></div>
  <div class="lm-shade"></div><div class="lm-vignette"></div><div class="lm-grain"></div>
</div>
<div class="lm-top">
  <div class="lm-ctx"><span class="lm-ctx-l">Playing from</span><b class="lm-ctx-n"></b></div>
  <div class="lm-clock"></div>
  <div class="lm-btns">
    <button class="lm-ib" data-a="lyrics" title="Lyrics (L)">${icons.lyrics}</button>
    <button class="lm-ib" data-a="settings" title="Settings">${icons.gear}</button>
    <button class="lm-ib" data-a="close" title="Close (Esc)">${icons.close}</button>
  </div>
</div>
<div class="lm-main">
  <div class="lm-art-wrap">
    <div class="lm-art"><video muted loop playsinline></video></div>
    <div class="lm-meta"><div class="lm-title"></div><div class="lm-artist"></div><div class="lm-album"></div></div>
  </div>
  <div class="lm-lyrics-wrap"><div class="lm-lyrics"></div></div>
</div>
<div class="lm-bottom">
  <div class="lm-prog"><span class="lm-cur">0:00</span><div class="lm-bar"><i><b></b></i></div><span class="lm-dur">0:00</span></div>
  <div class="lm-row">
    <div class="lm-next"><img alt=""><div><small>Up next</small><span></span><em></em></div></div>
    <div class="lm-ctrl">
      <button class="lm-ib" data-a="shuffle" title="Shuffle">${icons.shuffle}</button>
      <button class="lm-ib" data-a="prev" title="Previous">${icons.prev}</button>
      <button class="lm-ib lm-play" data-a="play" title="Play / Pause">${icons.play}</button>
      <button class="lm-ib" data-a="next" title="Next">${icons.next}</button>
      <button class="lm-ib" data-a="repeat" title="Repeat">${icons.repeat}</button>
    </div>
    <div class="lm-right">
      <button class="lm-ib" data-a="heart" title="Like">${icons.heartO}</button>
      <button class="lm-ib" data-a="mute" title="Mute">${icons.vol}</button>
      <div class="lm-vol"><i><b></b></i></div>
    </div>
  </div>
</div>
<div class="lm-settings"></div>`;

    const style = el("style");
    style.id = "lumen-style";
    style.textContent = css;

    const q = (s) => $(s, root);
    const refs = {};

    function mount() {
        if (!document.body) return setTimeout(mount, 100);
        if (!$("#lumen-style")) document.head.appendChild(style);
        document.body.appendChild(root);
        Object.assign(refs, {
            cover: q(".lm-cover"), art: q(".lm-art"), artVideo: q(".lm-art video"), bgVideo: q(".lm-bgvideo"), title: q(".lm-title"), artist: q(".lm-artist"), album: q(".lm-album"),
            ctxN: q(".lm-ctx-n"), ctxL: q(".lm-ctx-l"), clock: q(".lm-clock"), lyrics: q(".lm-lyrics"),
            cur: q(".lm-cur"), dur: q(".lm-dur"), bar: q(".lm-bar"), fill: q(".lm-bar b"), play: q(".lm-play"),
            next: q(".lm-next"), nextImg: q(".lm-next img"), nextT: q(".lm-next span"), nextA: q(".lm-next em"),
            vol: q(".lm-vol"), volFill: q(".lm-vol b"), settings: q(".lm-settings"),
        });
        bind();
        buildSettings();
        applyCfg();
    }

    // ---------- settings ----------
    const seg = (key, opts) =>
        `<div class="lm-seg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${cfg[key] === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
    const tog = (key, label) =>
        `<div class="lm-set" data-t="${key}"><span>${label}</span><span class="lm-tg ${cfg[key] ? "on" : ""}"></span></div>`;
    const rng = (key, label, min, max) =>
        `<div class="lm-set col"><span>${label}</span><input type="range" data-r="${key}" min="${min}" max="${max}" value="${cfg[key]}"></div>`;

    function buildSettings() {
        refs.settings.innerHTML = `
<h3>Layout</h3>${seg("layout", [["split", "Split"], ["center", "Cover"], ["lyrics", "Lyrics"]])}
<h3>Artwork</h3>${seg("artMode", [["cover", "Cover"], ["canvas", "Canvas"]])}
${tog("canvasBackground", "Canvas as background")}
<h3>Background</h3>${seg("background", [["dynamic", "Dynamic"], ["cover", "Cover"], ["solid", "Solid"]])}
${rng("blur", "Blur", 0, 120)}${rng("brightness", "Brightness", 10, 100)}
<h3>Lyrics</h3>${tog("lyrics", "Show lyrics")}${rng("lyricsSize", "Size", 60, 160)}
${seg("lyricsAlign", [["left", "Left"], ["center", "Center"], ["right", "Right"]])}
<h3>Display</h3>
${tog("showUpNext", "Up next")}${tog("showContext", "Playing from")}${tog("showVolume", "Volume")}
${tog("showClock", "Clock")}${tog("showExtraInfo", "Album name")}
<h3>Behavior</h3>
${tog("autoHide", "Hide controls when idle")}${tog("nativeFullscreen", "Real fullscreen window")}
${tog("beautifulLyrics", "Prefer Beautiful Lyrics sync")}
<div class="lm-ver">Lumen ${VERSION}</div>`;
        refs.settings.onclick = (e) => {
            const s = e.target.closest(".lm-seg button");
            if (s) {
                cfg[s.parentNode.dataset.k] = s.dataset.v;
                [...s.parentNode.children].forEach((b) => b.classList.toggle("on", b === s));
                commit();
                if (s.parentNode.dataset.k === "artMode") updateCanvas();
                return;
            }
            const t = e.target.closest("[data-t]");
            if (t) {
                const k = t.dataset.t;
                cfg[k] = !cfg[k];
                t.querySelector(".lm-tg").classList.toggle("on", cfg[k]);
                commit();
                if (k === "lyrics" && cfg.lyrics) fetchLyrics(true);
                if (k === "beautifulLyrics") fetchLyrics(true);
                if (k === "canvasBackground") updateCanvas();
            }
        };
        refs.settings.oninput = (e) => {
            const r = e.target.dataset.r;
            if (!r) return;
            cfg[r] = Number(e.target.value);
            commit();
        };
        refs.settings.addEventListener("click", (e) => e.stopPropagation());
    }

    function commit() {
        save();
        applyCfg();
    }

    function applyCfg() {
        root.classList.remove("layout-split", "layout-center", "layout-lyrics", "align-left", "align-center", "align-right");
        root.classList.add("layout-" + cfg.layout, "align-" + cfg.lyricsAlign);
        root.classList.toggle("no-lyrics", !cfg.lyrics);
        root.style.setProperty("--lsize", cfg.lyricsSize / 100);
        refs.cover.style.display = cfg.background === "cover" ? "" : "none";
        root.querySelectorAll(".lm-blob").forEach((b) => (b.style.display = cfg.background === "dynamic" ? "" : "none"));
        refs.cover.style.filter = `blur(${cfg.blur}px)`;
        q(".lm-shade").style.opacity = 1 - cfg.brightness / 100;
        q(".lm-blob.a").style.filter = q(".lm-blob.b").style.filter = `blur(${Math.max(20, cfg.blur / 1.5)}px)`;
        refs.next.style.display = cfg.showUpNext ? "" : "none";
        refs.ctxN.parentNode.style.visibility = cfg.showContext ? "" : "hidden";
        refs.vol.style.display = cfg.showVolume ? "" : "none";
        q('[data-a="mute"]').style.display = cfg.showVolume ? "" : "none";
        refs.clock.style.display = cfg.showClock ? "" : "none";
        refs.album.style.display = cfg.showExtraInfo ? "" : "none";
        q('[data-a="lyrics"]').classList.toggle("on", cfg.lyrics);
    }

    // ---------- interaction ----------
    function bind() {
        root.addEventListener("click", (e) => {
            const b = e.target.closest("[data-a]");
            if (!b) return refs.settings.classList.remove("show");
            const a = b.dataset.a;
            if (a === "close") close();
            else if (a === "settings") refs.settings.classList.toggle("show");
            else if (a === "lyrics") {
                cfg.lyrics = !cfg.lyrics;
                commit();
                buildSettings();
                if (cfg.lyrics) fetchLyrics(true);
            } else if (a === "prev") P.back();
            else if (a === "next") P.next();
            else if (a === "play") P.togglePlay();
            else if (a === "shuffle") P.toggleShuffle(), setTimeout(syncState, 150);
            else if (a === "repeat") P.toggleRepeat(), setTimeout(syncState, 150);
            else if (a === "heart") P.toggleHeart(), setTimeout(syncState, 250);
            else if (a === "mute") P.toggleMute(), setTimeout(syncState, 100);
        });
        root.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            refs.settings.classList.toggle("show");
        });

        const drag = (node, fn, start, end) => {
            const move = (e) => fn(Math.min(1, Math.max(0, (e.clientX - node.getBoundingClientRect().left) / node.offsetWidth)));
            node.addEventListener("pointerdown", (e) => {
                start?.();
                move(e);
                const mv = (ev) => move(ev);
                const up = (ev) => {
                    removeEventListener("pointermove", mv);
                    removeEventListener("pointerup", up);
                    end?.(ev);
                };
                addEventListener("pointermove", mv);
                addEventListener("pointerup", up);
            });
        };
        let seekPct = 0;
        drag(
            refs.bar,
            (p) => {
                seekPct = p;
                refs.fill.style.width = p * 100 + "%";
            },
            () => (state.seeking = true),
            () => {
                P.seek(seekPct * trackMeta().duration);
                state.seeking = false;
            }
        );
        drag(refs.vol, (p) => {
            P.setVolume(p);
            refs.volFill.style.width = p * 100 + "%";
        });

        refs.lyrics.addEventListener("click", (e) => {
            const l = e.target.closest(".lm-line[data-t]");
            if (l && state.lyrics?.synced) P.seek(Number(l.dataset.t));
        });

        const wake = () => {
            root.classList.remove("idle");
            clearTimeout(state.hideTimer);
            if (cfg.autoHide && state.open) state.hideTimer = setTimeout(() => !refs.settings.classList.contains("show") && root.classList.add("idle"), 4000);
        };
        root.addEventListener("mousemove", wake);
        root.addEventListener("keydown", wake);
        state.wake = wake;

        document.addEventListener("keydown", (e) => {
            if (/INPUT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === "Escape" && state.open) {
                e.stopPropagation();
                close();
            } else if ((e.key === "f" || e.key === "F" || e.key === "t" || e.key === "T") && !e.shiftKey) {
                e.preventDefault();
                state.open ? close() : open();
            } else if ((e.key === "l" || e.key === "L") && state.open) {
                cfg.lyrics = !cfg.lyrics;
                commit();
                buildSettings();
                if (cfg.lyrics) fetchLyrics(true);
            }
        }, true);
    }

    // ---------- state sync ----------
    function syncState() {
        const playing = P.isPlaying();
        refs.play.innerHTML = playing ? icons.pause : icons.play;
        root.classList.toggle("paused", !playing);
        for (const v of [refs.artVideo, refs.bgVideo]) if (v?.classList.contains("show")) playing ? v.play().catch(() => {}) : v.pause();
        q('[data-a="shuffle"]').classList.toggle("on", !!P.getShuffle());
        const rep = P.getRepeat();
        const r = q('[data-a="repeat"]');
        r.classList.toggle("on", rep > 0);
        r.style.position = "relative";
        r.title = rep === 2 ? "Repeat one" : rep === 1 ? "Repeat all" : "Repeat";
        const h = q('[data-a="heart"]');
        const liked = !!P.getHeart();
        h.innerHTML = liked ? icons.heart : icons.heartO;
        h.classList.toggle("on", liked);
        const v = P.getMute() ? 0 : P.getVolume();
        refs.volFill.style.width = v * 100 + "%";
        q('[data-a="mute"]').style.opacity = v === 0 ? 0.4 : "";
    }

    function contextName() {
        const d = P.data;
        const uri = d?.context_uri || d?.context?.uri || "";
        const m = d?.context?.metadata || {};
        let name = m.context_description || m.context_name || "";
        let label = "Playing from";
        if (/collection:tracks|collection$/.test(uri)) name = "Liked Songs";
        else if (uri.includes(":artist:")) label = "Playing from artist";
        else if (uri.includes(":album:")) label = "Playing from album";
        else if (uri.includes(":playlist:") || uri.includes(":show:")) label = "Playing from playlist";
        return { label, name: name || trackMeta().album };
    }

    function updateNext() {
        try {
            const n = Spicetify.Queue?.nextTracks?.[0]?.contextTrack?.metadata;
            if (!n) {
                refs.next.style.visibility = "hidden";
                return;
            }
            refs.next.style.visibility = "";
            refs.nextImg.src = imgUrl(n.image_url || n.image_large_url || "");
            refs.nextT.textContent = n.title || "";
            refs.nextA.textContent = n.artist_name || "";
        } catch {
            refs.next.style.visibility = "hidden";
        }
    }

    // ---------- colors ----------
    async function extractColors(cover) {
        try {
            if (Spicetify.colorExtractor && P.data?.item?.uri) {
                const c = await Spicetify.colorExtractor(P.data.item.uri);
                const hex = (h) => (h ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
                const a = hex(c.VIBRANT || c.PROMINENT || c.LIGHT_VIBRANT);
                const b = hex(c.DARK_VIBRANT || c.DESATURATED || c.DARK_MUTED);
                if (a) return [a, b || a.map((x) => x * 0.5)];
            }
        } catch {}
        return await new Promise((res) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                try {
                    const c = document.createElement("canvas");
                    c.width = c.height = 24;
                    const g = c.getContext("2d");
                    g.drawImage(img, 0, 0, 24, 24);
                    const d = g.getImageData(0, 0, 24, 24).data;
                    let best = null, bestS = -1, sum = [0, 0, 0];
                    for (let i = 0; i < d.length; i += 4) {
                        const [r, gg, b] = [d[i], d[i + 1], d[i + 2]];
                        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
                        const s = (mx - mn) * (mx / 255);
                        sum[0] += r; sum[1] += gg; sum[2] += b;
                        if (s > bestS) (bestS = s), (best = [r, gg, b]);
                    }
                    const n = d.length / 4;
                    res([best, sum.map((x) => x / n)]);
                } catch {
                    res(null);
                }
            };
            img.onerror = () => res(null);
            img.src = cover;
        });
    }

    async function updateColors(cover) {
        const cols = await extractColors(cover);
        if (!cols) return;
        state.color = cols[0];
        state.color2 = cols[1];
        root.style.setProperty("--c1", cols[0].map(Math.round).join(","));
        root.style.setProperty("--c2", cols[1].map(Math.round).join(","));
        if (cfg.background === "solid") root.style.background = rgb(cols[1].map((x) => x * 0.6));
    }

    // ---------- lyrics ----------
    const parseLrc = (lrc) => {
        const out = [];
        for (const raw of lrc.split("\n")) {
            const m = raw.match(/^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$/);
            if (!m) continue;
            const text = m[2].trim();
            for (const t of m[1].matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) out.push({ t: (Number(t[1]) * 60 + Number(t[2])) * 1000, text });
        }
        return out.sort((a, b) => a.t - b.t);
    };

    async function fromSpotify(id) {
        const r = await Spicetify.CosmosAsync.get(
            `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`
        );
        const l = r?.lyrics;
        if (!l?.lines?.length) return null;
        const synced = l.syncType === "LINE_SYNCED";
        return {
            synced,
            source: "Spotify" + (l.provider ? ` · ${l.provider}` : ""),
            lines: l.lines.map((x) => ({ t: Number(x.startTimeMs), text: x.words === "♪" ? "" : x.words })),
        };
    }

    async function fromLrclib(m) {
        const p = new URLSearchParams({
            track_name: m.title, artist_name: m.artist.split(",")[0], album_name: m.album, duration: Math.round(m.duration / 1000),
        });
        let r = await fetch("https://lrclib.net/api/get?" + p);
        if (!r.ok) {
            r = await fetch("https://lrclib.net/api/search?" + new URLSearchParams({ track_name: m.title, artist_name: m.artist.split(",")[0] }));
            if (!r.ok) return null;
            const list = await r.json();
            const hit = list.find((x) => x.syncedLyrics) || list[0];
            if (!hit) return null;
            return lrclibResult(hit);
        }
        return lrclibResult(await r.json());
    }
    const lrclibResult = (j) => {
        if (j.syncedLyrics) return { synced: true, source: "LRCLIB", lines: parseLrc(j.syncedLyrics) };
        if (j.plainLyrics) return { synced: false, source: "LRCLIB", lines: j.plainLyrics.split("\n").map((t) => ({ t: 0, text: t })) };
        return null;
    };

    // Beautiful Lyrics keeps its data in Spicetify's local storage / DOM only when its own view is
    // open, so Lumen cannot read it directly. When it is installed, line-synced Spotify lyrics (which
    // BL also uses as a base) are preferred and the lines are re-timed the same way.
    const hasBeautifulLyrics = () =>
        !!(Spicetify.Config?.extensions || []).concat(Spicetify.Config?.custom_apps || []).some?.((x) => /beautiful/i.test(x)) ||
        !!document.querySelector('[data-testid="BeautifulLyrics"],#BeautifulLyrics,.BeautifulLyrics');

    async function fetchLyrics(force) {
        if (!cfg.lyrics) return;
        const m = trackMeta();
        if (!m.uri) return;
        if (!force && state.lyricsFor === m.uri) return;
        state.lyricsFor = m.uri;
        state.lyrics = null;
        state.active = -1;
        refs.lyrics.innerHTML = '<div class="lm-nolyrics">…</div>';
        const id = m.uri.split(":")[2];
        let res = null;
        const order = cfg.beautifulLyrics ? ["spotify", "lrclib"] : ["lrclib", "spotify"];
        for (const p of order) {
            try {
                res = p === "spotify" ? await fromSpotify(id) : await fromLrclib(m);
            } catch {}
            if (res?.lines?.length && (res.synced || p === order[order.length - 1])) break;
            if (res?.lines?.length) {
                const alt = await (p === "spotify" ? fromLrclib(m) : fromSpotify(id)).catch(() => null);
                if (alt?.synced) res = alt;
                break;
            }
        }
        if (state.lyricsFor !== m.uri) return;
        state.lyrics = res;
        renderLyrics();
    }

    function renderLyrics() {
        const L = state.lyrics;
        const box = refs.lyrics;
        box.classList.toggle("lm-static", !!L && !L.synced);
        if (!L?.lines?.length) {
            box.innerHTML = '<div class="lm-nolyrics">No lyrics for this track</div>';
            return;
        }
        box.innerHTML = L.lines
            .map((l, i) => `<div class="lm-line ${l.text ? "" : "empty dots"}" data-i="${i}" data-t="${l.t}">${l.text ? esc(l.text) : "•••"}</div>`)
            .join("");
        state.active = -1;
        box.scrollTop = 0;
    }

    function tickLyrics(pos) {
        const L = state.lyrics;
        if (!L?.synced) return;
        let lo = 0, hi = L.lines.length - 1, idx = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (L.lines[mid].t <= pos + 150) (idx = mid), (lo = mid + 1);
            else hi = mid - 1;
        }
        if (idx === state.active) return;
        state.active = idx;
        const kids = refs.lyrics.children;
        for (let i = 0; i < kids.length; i++) {
            const k = kids[i];
            if (!k.dataset.i) continue;
            const d = Math.abs(i - idx);
            k.classList.toggle("active", i === idx);
            k.classList.toggle("past", i < idx);
            k.style.setProperty("--lb", Math.min(d, 5) * 0.8 + "px");
        }
        const a = kids[idx];
        if (a) refs.lyrics.scrollTo({ top: a.offsetTop - refs.lyrics.clientHeight / 2 + a.offsetHeight / 2, behavior: "smooth" });
    }

    // ---------- canvas ----------
    const canvasCache = new Map();

    const protoReq = (uri) => {
        const u = new TextEncoder().encode(uri);
        const entity = new Uint8Array([0x0a, u.length, ...u]);
        return new Uint8Array([0x0a, entity.length, ...entity]);
    };

    let spHosts = null;
    const getToken = async () => {
        const A = Spicetify.Platform?.AuthorizationAPI;
        try {
            const t = await A._tokenProvider({ preferCached: true });
            if (t?.accessToken) return t.accessToken;
        } catch {}
        return A?.getState?.()?.token?.accessToken || Spicetify.Session?.accessToken;
    };
    const getSpHost = async () => {
        try {
            spHosts ||= (await (await fetch("https://apresolve.spotify.com/?type=spclient")).json()).spclient;
        } catch {}
        const list = spHosts?.length ? spHosts : ["spclient.wg.spotify.com"];
        return list[Math.floor(Math.random() * list.length)];
    };

    async function fetchCanvas(uri) {
        if (canvasCache.has(uri)) return canvasCache.get(uri);
        let url = null;
        try {
            const [token, host] = await Promise.all([getToken(), getSpHost()]);
            const r = await fetch(`https://${host}/canvaz-cache/v0/canvases`, {
                method: "POST",
                headers: { "Content-Type": "application/x-protobuf", Authorization: `Bearer ${token}` },
                body: protoReq(uri),
            });
            if (r.ok) {
                const txt = new TextDecoder("latin1").decode(await r.arrayBuffer());
                url = (txt.match(/https:\/\/canvaz\.scdn\.co\/upload\/[!-~]+?\.(?:mp4|webm)/) || [])[0] || null;
            }
            console.log("[Lumen] canvas", r.status, url);
        } catch (e) {
            console.warn("[Lumen] canvas fetch failed", e);
        }
        if (url) canvasCache.set(uri, url);
        return url;
    }

    function setVideo(v, url) {
        if (url) {
            if (v.dataset.src !== url) {
                v.dataset.src = url;
                v.src = url;
            }
            v.classList.add("show");
            P.isPlaying() ? v.play().catch(() => {}) : v.pause();
        } else {
            v.classList.remove("show");
            v.pause();
            v.removeAttribute("src");
            delete v.dataset.src;
        }
    }

    async function updateCanvas() {
        const uri = P.data?.item?.uri;
        const want = cfg.artMode === "canvas" || cfg.canvasBackground;
        const url = want && uri ? await fetchCanvas(uri) : null;
        if (uri !== P.data?.item?.uri) return;
        setVideo(refs.artVideo, cfg.artMode === "canvas" ? url : null);
        setVideo(refs.bgVideo, cfg.canvasBackground ? url : null);
    }

    // ---------- track updates ----------
    async function updateTrack() {
        const m = trackMeta();
        refs.title.textContent = m.title;
        refs.title.title = m.title;
        refs.artist.textContent = m.artist;
        refs.album.textContent = m.album;
        refs.art.style.backgroundImage = m.cover ? `url("${m.cover}")` : "";
        refs.cover.style.backgroundImage = m.cover ? `url("${m.cover}")` : "";
        refs.dur.textContent = fmt(m.duration);
        const c = contextName();
        refs.ctxL.textContent = c.label;
        refs.ctxN.textContent = c.name;
        updateNext();
        syncState();
        updateColors(m.cover);
        fetchLyrics();
        updateCanvas();
    }

    function loop() {
        if (!state.open) return;
        const pos = P.getProgress();
        const dur = trackMeta().duration || 1;
        if (!state.seeking) {
            refs.fill.style.width = Math.min(100, (pos / dur) * 100) + "%";
            refs.cur.textContent = fmt(pos);
        }
        tickLyrics(pos);
        if (cfg.showClock) refs.clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        state.raf = requestAnimationFrame(loop);
    }

    // ---------- open / close ----------
    async function open() {
        if (state.open) return;
        state.open = true;
        root.classList.add("open");
        applyCfg();
        await updateTrack();
        state.lyricsFor = null;
        fetchLyrics();
        if (cfg.nativeFullscreen && !document.fullscreenElement) root.requestFullscreen?.().catch(() => {});
        state.wake?.();
        loop();
    }

    function close() {
        if (!state.open) return;
        state.open = false;
        root.classList.remove("open", "idle");
        refs.settings.classList.remove("show");
        cancelAnimationFrame(state.raf);
        clearTimeout(state.hideTimer);
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }

    document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement && state.open && cfg.nativeFullscreen && root.dataset.fsOK) close();
        if (document.fullscreenElement === root) root.dataset.fsOK = "1";
        else delete root.dataset.fsOK;
    });

    // ---------- entry points ----------
    mount();

    new Spicetify.Topbar.Button("Lumen", icons.full, () => (state.open ? close() : open()), false);

    try {
        new Spicetify.Playbar.Button("Lumen fullscreen", icons.full, () => (state.open ? close() : open()), false, false);
    } catch {
        // older Spicetify without Playbar.Button
    }

    new Spicetify.Menu.Item("Lumen settings", false, () => {
        open().then(() => refs.settings.classList.add("show"));
    }).register?.();

    P.addEventListener("songchange", () => state.open && updateTrack());
    P.addEventListener("onplaypause", () => state.open && syncState());
    setInterval(() => state.open && (syncState(), updateNext()), 2000);

    console.log(`[Lumen] ${VERSION} loaded`);
})();
