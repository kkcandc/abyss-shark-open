export class SeaAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private started = false

  start(): void {
    if (this.started) {
      void this.ctx?.resume()
      return
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)
    this.master = master
    this.started = true
    this.ambience()
  }

  setDepth(depth: number, overlay: boolean): void {
    if (!this.filter || !this.master || !this.ctx) return
    const now = this.ctx.currentTime
    this.filter.frequency.setTargetAtTime(Math.max(140, 520 - depth * 3.2), now, 0.4)
    this.master.gain.setTargetAtTime(overlay ? 0.22 : 0.55, now, 0.2)
  }

  bite(): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(180, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
    this.noise(0.05, 0.12, 900)
  }

  splash(): void {
    this.noise(0.28, 0.2, 1400)
  }

  discover(): void {
    this.notes([523, 659, 784], 0.14, 0.07)
  }

  evolve(): void {
    this.notes([392, 494, 587, 784], 0.22, 0.09)
  }

  whale(): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(90, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(160, ctx.currentTime + 1.1)
    osc.frequency.linearRampToValueAtTime(70, ctx.currentTime + 2.4)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.4)
    gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 2.6)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start()
    osc.stop(ctx.currentTime + 2.7)
  }

  private ambience(): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const len = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.2
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    const gain = ctx.createGain()
    gain.gain.value = 0.28
    src.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    src.start()
    this.filter = filter
  }

  private noise(seconds: number, volume: number, freq: number): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const len = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    src.start()
  }

  private notes(freqs: number[], dur: number, gap: number): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    freqs.forEach((freq, i) => {
      const t = ctx.currentTime + i * gap
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
      osc.connect(gain)
      gain.connect(this.master!)
      osc.start(t)
      osc.stop(t + dur + 0.02)
    })
  }
}
