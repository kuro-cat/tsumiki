import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Box, Placed } from '../lib/pack'

type Ctx = {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; controls: OrbitControls
  group: THREE.Group; radius: number; bagKey: string; render: () => void; fit: () => void
}
export type SceneItem = { id: string; box: Placed; selected: boolean }

/** Axonometric line drawing of the bag: white faces, graphite edges, dashed above the section cut. Renders on demand only. */
export function Scene3D({ bag, placed, cut }: { bag: Box; placed: SceneItem[]; cut: number }) {
  const host = useRef<HTMLDivElement>(null)
  const ctx = useRef<Ctx | null>(null)

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000)
    camera.position.set(1, 0.85, 1).normalize().multiplyScalar(1000)
    camera.lookAt(0, 0, 0)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = false
    controls.minZoom = 0.5
    controls.maxZoom = 4
    const group = new THREE.Group()
    scene.add(group)
    const c: Ctx = { renderer, scene, camera, controls, group, radius: 40, bagKey: '', render: () => renderer.render(scene, camera), fit: () => {} }
    c.fit = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      const a = w / h
      camera.left = -c.radius * a; camera.right = c.radius * a; camera.top = c.radius; camera.bottom = -c.radius
      camera.updateProjectionMatrix()
      c.render()
    }
    controls.addEventListener('change', c.render)
    const ro = new ResizeObserver(c.fit)
    ro.observe(el)
    ctx.current = c
    return () => {
      ro.disconnect(); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); ctx.current = null
    }
  }, [])

  useEffect(() => {
    const c = ctx.current
    if (!c) return
    c.group.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | undefined
      mat?.dispose?.()
    })
    c.group.clear()
    const ink = 0x2b2b2b
    const bagGeo = new THREE.BoxGeometry(bag.l, bag.h, bag.w)
    c.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(bagGeo), new THREE.LineBasicMaterial({ color: ink })))
    bagGeo.dispose()
    const size = Math.ceil(Math.max(bag.l, bag.w) / 10) * 10 + 20
    const grid = new THREE.GridHelper(size, size, 0xd8dade, 0xecedef)
    grid.position.y = -bag.h / 2 - 0.05
    c.group.add(grid)
    for (const { box, selected } of placed) {
      const above = box.z >= cut - 1e-6
      const g = new THREE.BoxGeometry(box.l, box.h, box.w)
      const pos = new THREE.Vector3(box.x + box.l / 2 - bag.l / 2, box.z + box.h / 2 - bag.h / 2, box.y + box.w / 2 - bag.w / 2)
      if (!above) {
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xfcfcfb, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
        mesh.position.copy(pos)
        c.group.add(mesh)
      }
      const lines = new THREE.LineSegments(
        new THREE.EdgesGeometry(g),
        above ? new THREE.LineDashedMaterial({ color: 0x9a9ea5, dashSize: 1.2, gapSize: 0.8 }) : new THREE.LineBasicMaterial({ color: selected ? 0x2f6fd0 : ink }),
      )
      if (above) lines.computeLineDistances()
      lines.position.copy(pos)
      c.group.add(lines)
    }
    const key = `${bag.l}x${bag.w}x${bag.h}`
    if (key !== c.bagKey) {
      c.bagKey = key
      c.radius = Math.hypot(bag.l, bag.w, bag.h) * 0.62
      c.camera.zoom = 1
      c.fit()
    } else c.render()
  }, [bag.l, bag.w, bag.h, placed, cut])

  return <div className="scene" ref={host} role="img" aria-label="Three-dimensional view of the packed bag. The plan view carries the same information." />
}
