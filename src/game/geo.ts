import * as THREE from 'three'

export function latheBody(opts: {
  stations: number
  seg: number
  nose: number
  tail: number
  radius: (t: number) => { rx: number; ry: number }
  dorsal: THREE.Color
  belly: THREE.Color
}): THREE.BufferGeometry {
  const { stations, seg, nose, tail, radius, dorsal, belly } = opts
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1)
    const z = nose + (tail - nose) * t
    const p = radius(t)
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      positions.push(ca * p.rx, sa * p.ry, z)
      const bellyAmt = THREE.MathUtils.smoothstep(sa, 0.25, -0.75)
      const c = dorsal.clone().lerp(belly, bellyAmt)
      colors.push(c.r, c.g, c.b)
    }
  }

  for (let i = 0; i < stations - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j
      const b = i * seg + ((j + 1) % seg)
      const c = (i + 1) * seg + j
      const d = (i + 1) * seg + ((j + 1) % seg)
      indices.push(a, c, b, b, c, d)
    }
  }

  const noseCenter = positions.length / 3
  positions.push(0, 0, nose)
  colors.push(dorsal.r, dorsal.g, dorsal.b)
  const tailCenter = positions.length / 3
  positions.push(0, 0, tail)
  colors.push(dorsal.r * 0.8, dorsal.g * 0.8, dorsal.b * 0.8)

  for (let j = 0; j < seg; j++) {
    const a = j
    const b = (j + 1) % seg
    indices.push(noseCenter, a, b)
    const c = (stations - 1) * seg + j
    const d = (stations - 1) * seg + ((j + 1) % seg)
    indices.push(tailCenter, d, c)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

export function finShape(points: [number, number][]): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1])
  shape.closePath()
  return new THREE.ShapeGeometry(shape, 3)
}

export function fishGeometry(): THREE.BufferGeometry {
  const body = latheBody({
    stations: 12,
    seg: 12,
    nose: 0.55,
    tail: -0.7,
    dorsal: new THREE.Color('#ffffff'),
    belly: new THREE.Color('#f2f2f2'),
    radius(t) {
      const hump = Math.sin(Math.min(t, 1) * Math.PI) ** 0.72
      const nose = t < 0.12 ? t / 0.12 : 1
      const tail = t > 0.82 ? (1 - t) / 0.18 : 1
      const k = hump * nose * Math.max(tail, 0.15)
      return { rx: 0.05 + k * 0.2, ry: 0.04 + k * 0.13 }
    },
  })
  const tail = finShape([
    [0, 0],
    [0.42, 0.28],
    [0.16, 0.05],
    [0.38, -0.22],
  ])
  tail.rotateY(Math.PI / 2)
  tail.translate(0, 0, -0.62)
  const dorsal = finShape([
    [0, 0],
    [0.28, 0.02],
    [0.08, 0.32],
    [-0.08, 0.04],
  ])
  dorsal.rotateY(-Math.PI / 2)
  dorsal.translate(0, 0.12, 0.05)
  const geo = merge([body, tail, dorsal])
  geo.computeVertexNormals()
  return geo
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let offset = 0
  const positions: number[] = []
  const indices: number[] = []
  for (const g of geos) {
    const pos = g.getAttribute('position')
    for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    const idx = g.getIndex()
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset)
    }
    offset += pos.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setIndex(indices)
  return out
}
