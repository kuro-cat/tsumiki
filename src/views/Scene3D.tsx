import { useEffect, useEffectEvent, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { Placed } from '../lib/pack'
import type { Compartment } from '../store'

type Ctx = {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; controls: OrbitControls
  group: THREE.Group; radius: number; bagKey: string; render: () => void; fit: () => void
  gizmo: TransformControls; pick: THREE.Mesh[]; groups: Record<string, THREE.Group>; ext: { EL: number; EW: number; EH: number }
}
/** Arranging compartments: which one is picked, and where it went (cm from the bag's corner; z orders the stack, it settles). */
export type Arrange = { selected: string | null; onSelect: (id: string | null) => void; onMove: (id: string, at: { x: number; y: number; z: number }) => void }
export type SceneItem = { id: string; box: Placed; selected: boolean; color?: string }
export type SceneComp = { c: Compartment; boxes: SceneItem[]; fill: { height: number; over: boolean } }
export type CamView = 'iso' | 'top' | 'front' | 'side'
const DIRS: Record<CamView, [number, number, number]> = { iso: [1, 0.85, 1], top: [0, 1, 0.001], front: [0, 0.001, 1], side: [1, 0.001, 0] }
const eps = 1e-6
/** Theme tokens as THREE colors, read from the document so the scene follows data-theme. */
const tok = (name: string) => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim())

/** Axonometric line drawing of the assembled bag: white faces, graphite edges, dashed above the section cut, translucent soft fill. Renders on demand only. */
export function Scene3D({ comps, cut, cam, arrange }: { comps: SceneComp[]; cut: number; cam: { view: CamView; n: number }; arrange?: Arrange }) {
  // The scene's listeners are set up once; this reads the arrange props of the latest render.
  const arrangeNow = useEffectEvent(() => arrange)
  const host = useRef<HTMLDivElement>(null)
  const ctx = useRef<Ctx | null>(null)
  const [themeN, setThemeN] = useState(0)
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeN((n) => n + 1))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000)
    camera.position.set(...DIRS.iso).normalize().multiplyScalar(1000)
    camera.lookAt(0, 0, 0)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = false
    controls.minZoom = 0.5
    controls.maxZoom = 4
    const group = new THREE.Group()
    scene.add(group)
    // Axis arrows for moving a compartment, snapped to whole centimetres; orbiting pauses while one is dragged.
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.setTranslationSnap(1)
    gizmo.setSize(0.8)
    // Straight arrows only: the two-axis plane handles are tinted violet and make moves harder to read. Removed from both the drawn and the picking gizmo.
    const parts = (gizmo as unknown as { _gizmo: { gizmo: Record<string, THREE.Object3D>; picker: Record<string, THREE.Object3D> } })._gizmo
    for (const g of [parts.gizmo.translate, parts.picker.translate]) g.children.filter((h) => ['XY', 'YZ', 'XZ', 'XYZ'].includes(h.name)).forEach((h) => g.remove(h))
    scene.add(gizmo.getHelper())
    const c: Ctx = { renderer, scene, camera, controls, group, radius: 40, bagKey: '', render: () => renderer.render(scene, camera), fit: () => {}, gizmo, pick: [], groups: {}, ext: { EL: 1, EW: 1, EH: 1 } }
    gizmo.addEventListener('change', () => c.render())
    gizmo.addEventListener('dragging-changed', (e) => { controls.enabled = !(e as unknown as { value: boolean }).value })
    gizmo.addEventListener('mouseUp', () => {
      const o = gizmo.object, id = o?.userData.id as string | undefined
      if (!o || !id) return
      // The group sits at the compartment's corner in scene space; back to cm from the bag's corner.
      arrangeNow()?.onMove(id, { x: Math.round(o.position.x + c.ext.EL / 2), y: Math.round(o.position.z + c.ext.EW / 2), z: Math.max(0, Math.round(o.position.y + c.ext.EH / 2)) })
    })
    // A click (not a drag) picks the compartment under the pointer, or clears the pick.
    let down: [number, number] | null = null
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY] }
    const onUp = (e: PointerEvent) => {
      const arr = arrangeNow()
      if (!arr || !down || gizmo.dragging || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
      const r = renderer.domElement.getBoundingClientRect()
      const ray = new THREE.Raycaster()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObjects(c.pick, false)[0]
      arr.onSelect((hit?.object.userData.id as string) ?? null)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
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
      ro.disconnect(); gizmo.detach(); gizmo.dispose(); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); ctx.current = null
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
    c.pick = []
    c.groups = {}
    const ink = tok('--ink'), paper = tok('--paper'), blue = tok('--blue'), red = tok('--red'), ink3 = tok('--ink-3')
    const tint = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tint')) / 100 || 0.28
    const EL = Math.max(1, ...comps.map(({ c }) => c.x + c.l)), EW = Math.max(1, ...comps.map(({ c }) => c.y + c.w)), EH = Math.max(1, ...comps.map(({ c }) => c.z + c.h))
    c.ext = { EL, EW, EH }
    // Plan x → X, plan y → Z, height z → Y, centred on the assembled bag.
    const at = (x: number, z: number, y: number) => new THREE.Vector3(x - EL / 2, z - EH / 2, y - EW / 2)
    const size = Math.ceil(Math.max(EL, EW) / 10) * 10 + 20
    const grid = new THREE.GridHelper(size, size, tok('--grid-major'), tok('--grid'))
    grid.position.y = -EH / 2 - 0.05
    c.group.add(grid)
    for (const { c: comp, boxes, fill } of comps) {
      // Everything in a compartment hangs off one group at its corner; children are placed relative to it.
      const cg = new THREE.Group()
      cg.position.copy(at(comp.x, comp.z, comp.y))
      cg.userData.id = comp.id
      c.group.add(cg)
      c.groups[comp.id] = cg
      const local = (x: number, z: number, y: number) => new THREE.Vector3(x - comp.x, z - comp.z, y - comp.y)
      const g = new THREE.BoxGeometry(comp.l, comp.h, comp.w)
      const picked = arrange?.selected === comp.id
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: picked ? blue : ink }))
      edges.position.copy(local(comp.x + comp.l / 2, comp.z + comp.h / 2, comp.y + comp.w / 2))
      cg.add(edges)
      if (arrange) {
        // An invisible solid to click on.
        const hit = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
        hit.position.copy(edges.position)
        hit.userData.id = comp.id
        cg.add(hit)
        c.pick.push(hit)
      } else g.dispose()
      const cutLocal = cut - comp.z
      for (const { box, selected, color } of boxes) {
        const above = box.z >= cutLocal - eps
        const bg = new THREE.BoxGeometry(box.l, box.h, box.w)
        const pos = local(comp.x + box.x + box.l / 2, comp.z + box.z + box.h / 2, comp.y + box.y + box.w / 2)
        if (!above) {
          const mesh = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: color ? new THREE.Color(color).lerp(paper, 1 - tint) : paper, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
          mesh.position.copy(pos)
          cg.add(mesh)
        }
        const lines = new THREE.LineSegments(
          new THREE.EdgesGeometry(bg),
          above ? new THREE.LineDashedMaterial({ color: ink3, dashSize: 1.2, gapSize: 0.8 }) : new THREE.LineBasicMaterial({ color: selected ? blue : ink }),
        )
        if (above) lines.computeLineDistances()
        lines.position.copy(pos)
        cg.add(lines)
      }
      const fh = Math.min(fill.height, Math.max(0, cutLocal))
      if (fh > eps) {
        const fg = new THREE.BoxGeometry(comp.l - 0.2, fh, comp.w - 0.2)
        const mesh = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: fill.over ? red : ink3, transparent: true, opacity: 0.16, depthWrite: false }))
        mesh.position.copy(local(comp.x + comp.l / 2, comp.z + fh / 2, comp.y + comp.w / 2))
        cg.add(mesh)
      }
    }
    // The arrows follow the picked compartment across rebuilds.
    const target = arrange?.selected ? c.groups[arrange.selected] : undefined
    if (target) c.gizmo.attach(target); else c.gizmo.detach()
    const key = `${EL}x${EW}x${EH}`
    // Refit when the bag's size changes; while arranging, keep the traveler's zoom so the view doesn't jump.
    if (key !== c.bagKey) {
      const first = !c.bagKey
      c.bagKey = key
      c.radius = Math.hypot(EL, EW, EH) * 0.62
      if (!arrange || first) c.camera.zoom = 1
      c.camera.updateProjectionMatrix()
      c.fit()
    } else c.render()
  }, [comps, cut, themeN, arrange?.selected, !!arrange])

  useEffect(() => {
    const c = ctx.current
    if (!c) return
    c.camera.position.set(...DIRS[cam.view]).normalize().multiplyScalar(1000)
    c.camera.zoom = 1
    c.camera.lookAt(0, 0, 0)
    c.controls.update()
    c.fit()
  }, [cam.view, cam.n])

  return <div className={'scene' + (arrange ? ' arranging' : '')} ref={host} role="img" aria-label="Three-dimensional view of the assembled bag. The plan view carries the same information." />
}
