// Ninefold game state. Everything lives in the browser; the server only hands out puzzle packs.
(() => {
  const KEY_GAME = 'ninefold:game'
  const KEY_PREFS = 'ninefold:prefs'
  const KEY_STATS = 'ninefold:stats'
  const LEVELS = ['easy', 'medium', 'hard']

  // peers[i]: the 20 cells that share a row, column or box with cell i.
  const peers = Array.from({ length: 81 }, (_, i) => {
    const r = Math.floor(i / 9), c = i % 9, out = []
    for (let j = 0; j < 81; j++) {
      const jr = Math.floor(j / 9), jc = j % 9
      if (j !== i && (jr === r || jc === c || (Math.floor(jr / 3) === Math.floor(r / 3) && Math.floor(jc / 3) === Math.floor(c / 3)))) out.push(j)
    }
    return out
  })

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
  }
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  }

  const fmt = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0')
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  }

  const packs = {}
  const fetchPack = async (level) => (packs[level] ??= await (await fetch(`/puzzles/${level}.json`)).json())

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

  // Fire a one-off confetti burst on a full-screen canvas.
  const confetti = (canvas) => {
    const dpr = window.devicePixelRatio || 1
    const w = (canvas.width = innerWidth * dpr), h = (canvas.height = innerHeight * dpr)
    const ctx = canvas.getContext('2d')
    const colors = ['#2a5bd7', '#8fb0ff', '#f5b700', '#e5484d', '#30a46c', '#ab4aba']
    const parts = Array.from({ length: 160 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = (8 + Math.random() * 12) * dpr
      return {
        x: w / 2, y: h * 0.45, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        s: (5 + Math.random() * 6) * dpr, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
        c: colors[Math.floor(Math.random() * colors.length)],
      }
    })
    const start = performance.now()
    const frame = (now) => {
      ctx.clearRect(0, 0, w, h)
      let live = false
      for (const p of parts) {
        p.vy += 0.35 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr
        if (p.y < h + 20) live = true
        ctx.save()
        ctx.translate(p.x, p.y); ctx.rotate(p.r)
        ctx.fillStyle = p.c
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2)
        ctx.restore()
      }
      if (live && now - start < 4000) requestAnimationFrame(frame)
      else ctx.clearRect(0, 0, w, h)
    }
    requestAnimationFrame(frame)
  }

  document.addEventListener('alpine:init', () => {
    Alpine.data('ninefold', () => ({
      levels: LEVELS,
      game: load(KEY_GAME, null),
      auto: load(KEY_PREFS, { auto: true }).auto,
      stats: load(KEY_STATS, { played: {}, solved: {}, best: {} }),
      sel: -1,
      pencil: false,
      paused: false,
      history: [],
      tickedAt: Date.now(),
      elapsed: 0,
      celebrating: false,
      origin: 40,

      init() {
        this.elapsed = this.game?.elapsed ?? 0
        setInterval(() => this.tick(), 500)
        window.addEventListener('pagehide', () => this.persist())
      },

      get won() { return !!this.game?.won },
      get clock() { return fmt(this.elapsed) },

      // Timer counts only while the game is visible, unpaused and unsolved.
      tick() {
        const now = Date.now()
        if (this.game && !this.paused && !this.won && !document.hidden) {
          this.elapsed += (now - this.tickedAt) / 1000
          if (Math.floor(this.elapsed) % 5 === 0) this.persist()
        }
        this.tickedAt = now
      },
      visibility() { this.tickedAt = Date.now(); if (document.hidden) this.persist() },
      togglePause() { this.paused = !this.paused; this.persist() },

      persist() {
        if (this.game) { this.game.elapsed = this.elapsed; save(KEY_GAME, this.game) }
        else try { localStorage.removeItem(KEY_GAME) } catch {}
      },

      async newGame(level) {
        const pack = await fetchPack(level)
        const played = (this.stats.played[level] ??= [])
        let fresh = pack.filter((p) => !played.includes(p.id))
        if (!fresh.length) { played.length = 0; fresh = pack }
        const p = fresh[Math.floor(Math.random() * fresh.length)]
        played.push(p.id)
        save(KEY_STATS, this.stats)

        const values = [...p.p].map(Number)
        this.game = {
          id: p.id, difficulty: level, puzzle: p.p, solution: p.s,
          values, marks: Array(81).fill(0), hidden: Array(81).fill(0),
          elapsed: 0, won: false,
        }
        this.elapsed = 0
        this.sel = -1
        this.paused = false
        this.history = []
        this.tickedAt = Date.now()
        this.persist()
      },

      quit() {
        this.game = null
        this.sel = -1
        this.persist()
      },

      given(i) { return this.game.puzzle[i] !== '0' },

      select(i) { this.sel = i },

      // A candidate shows if no peer holds that digit and the player hasn't struck it.
      // With auto-candidates off, only manually placed marks show.
      hasCand(i, d) {
        const g = this.game
        if (g.values[i]) return false
        const bit = 1 << (d - 1)
        if (!this.auto) return (g.marks[i] & bit) !== 0
        if (g.hidden[i] & bit) return false
        return !peers[i].some((p) => g.values[p] === d)
      },

      enter(d) {
        const g = this.game
        if (this.sel < 0 || this.paused || this.won || this.given(this.sel)) return
        const i = this.sel, bit = 1 << (d - 1)
        this.snapshot()
        if (this.pencil) {
          if (g.values[i]) return
          if (this.auto) g.hidden[i] ^= bit
          else g.marks[i] ^= bit
        } else {
          g.values[i] = g.values[i] === d ? 0 : d
          g.marks[i] = 0
          g.hidden[i] = 0
          if (g.values[i]) for (const p of peers[i]) g.marks[p] &= ~bit
          this.checkWin()
        }
        this.persist()
      },

      erase() {
        const g = this.game, i = this.sel
        if (i < 0 || this.paused || this.won || this.given(i)) return
        this.snapshot()
        g.values[i] = 0
        g.marks[i] = 0
        g.hidden[i] = 0
        this.persist()
      },

      toggleAuto() {
        this.auto = !this.auto
        save(KEY_PREFS, { auto: this.auto })
      },

      snapshot() {
        const g = this.game
        this.history.push(JSON.stringify([g.values, g.marks, g.hidden]))
        if (this.history.length > 300) this.history.shift()
      },

      undo() {
        if (!this.history.length || this.won) return
        const [values, marks, hidden] = JSON.parse(this.history.pop())
        Object.assign(this.game, { values, marks, hidden })
        this.persist()
      },

      checkWin() {
        const g = this.game
        if (!g.values.every((v, i) => String(v) === g.solution[i])) return
        g.won = true
        g.elapsed = this.elapsed
        const s = this.stats, t = Math.floor(this.elapsed)
        s.solved[g.difficulty] = (s.solved[g.difficulty] ?? 0) + 1
        if (!(g.difficulty in s.best) || t < s.best[g.difficulty]) s.best[g.difficulty] = t
        save(KEY_STATS, s)
        this.celebrate()
      },

      // Wave ripples out from the final cell; confetti bursts over the page.
      celebrate() {
        if (reducedMotion()) return
        this.origin = this.sel >= 0 ? this.sel : 40
        this.celebrating = true
        confetti(this.$refs.confetti)
        setTimeout(() => (this.celebrating = false), 2500)
      },

      cellStyle(i) {
        if (!this.celebrating) return ''
        const d = Math.hypot(Math.floor(i / 9) - Math.floor(this.origin / 9), (i % 9) - (this.origin % 9))
        return `--d:${Math.round(d * 70)}ms`
      },

      // Digits with all nine placed are disabled on the pad.
      done(d) { return this.game.values.filter((v) => v === d).length >= 9 },

      conflict(i) {
        const v = this.game.values[i]
        return v !== 0 && peers[i].some((p) => this.game.values[p] === v)
      },

      cellClass(i) {
        const g = this.game, v = g.values[i], c = i % 9, r = Math.floor(i / 9)
        const s = this.sel
        return {
          given: this.given(i),
          selected: i === s,
          peer: s >= 0 && i !== s && peers[s].includes(i),
          same: s >= 0 && i !== s && v !== 0 && v === g.values[s],
          conflict: this.conflict(i),
          'box-r': c % 3 === 2 && c !== 8,
          'box-b': r % 3 === 2 && r !== 8,
          win: this.celebrating,
          'edge-r': c === 8,
          'edge-b': r === 8,
        }
      },

      key(e) {
        if (!this.game || e.metaKey || e.altKey) return
        const k = e.key
        if (e.ctrlKey) { if (k === 'z') { e.preventDefault(); this.undo() } return }
        if (k >= '1' && k <= '9') this.enter(Number(k))
        else if (k === 'Backspace' || k === 'Delete' || k === '0') this.erase()
        else if (k === 'n') this.pencil = !this.pencil
        else if (k === 'u') this.undo()
        else if (k === 'p') this.togglePause()
        else if (k.startsWith('Arrow')) {
          e.preventDefault()
          const i = this.sel < 0 ? 40 : this.sel
          const r = Math.floor(i / 9), c = i % 9
          const n = { ArrowUp: [r - 1, c], ArrowDown: [r + 1, c], ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1] }[k]
          if (n && n[0] >= 0 && n[0] < 9 && n[1] >= 0 && n[1] < 9) this.sel = n[0] * 9 + n[1]
        }
      },

      statsLine() {
        const parts = LEVELS.filter((l) => this.stats.solved[l]).map((l) => `${l}: ${this.stats.solved[l]} solved, best ${fmt(this.stats.best[l])}`)
        return parts.join(' · ')
      },
    }))
  })
})()
