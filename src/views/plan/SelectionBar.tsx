import { fmtDim, lenUnit, type Bag, type Compartment } from '../../store'
import type { Api } from '../../store'
import { CatIcon, Icon } from '../../Icon'
import { MeasureInput, Menu } from '../../ui'
import type { PL } from './data'

/** Actions on the selected item: turn, tip, move to another bag or wear it, take it out. */
export function ItemBar({ selPl, bag, tb, rotatePl, tipPl, moveTo, removePl, setSelected }: {
  selPl: PL; bag: Bag | null; tb: Bag[]; rotatePl: (id: string) => void; tipPl: (id: string) => void; moveTo: (id: string, dest: string) => void
  removePl: (id: string) => void; setSelected: (id: string | null) => void
}) {
  return (
    // Keys typed in the bar, such as Escape or R in the Move to menu, stay here rather than acting on the plan.
    <div className="sel" onKeyDown={(e) => e.stopPropagation()}>
      <span className="sel-name"><CatIcon it={selPl.it} />{selPl.it.name}<span className="dim">{fmtDim(selPl.box)} {lenUnit()}</span></span>
      <button className="btn text" onClick={() => rotatePl(selPl.p.id)} title="Turn 90° (R)"><Icon name="rotate" />Turn<kbd>R</kbd></button>
      <button className="btn text" onClick={() => tipPl(selPl.p.id)} disabled={selPl.it.up} title={selPl.it.up ? 'This side up' : 'Tip onto the next face (T)'}><Icon name="tip" />Tip<kbd>T</kbd></button>
      <Menu label={`Move ${selPl.it.name} to…`} placeholder="Move to…" onPick={(to) => moveTo(selPl.p.id, to)}
        items={[...tb.filter((b) => b.id !== bag?.id).map((b) => ({ value: b.id, label: b.name })), { value: 'worn', label: 'Wear it' }]} />
      <button className="btn text" onClick={() => { removePl(selPl.p.id); setSelected(null) }} title="Take out (Delete)"><Icon name="x" />Take out</button>
    </div>
  )
}

/** Arranging: where the selected compartment sits, and a turn. */
export function CompartmentBar({ selComp, bag, api }: { selComp: Compartment; bag: Bag; api: Api }) {
  return (
    <div className="sel" onKeyDown={(e) => e.stopPropagation()}>
      <span className="sel-name">{selComp.name}<span className="dim">{fmtDim(selComp)} {lenUnit()}</span></span>
      {/* Fine control, from the bag's corner; stored in cm. Height only chooses what it rests on; it always settles. */}
      {(['x', 'y', 'z'] as const).map((k) => (
        <label key={k} className="cin xyz" title={k === 'x' ? 'Along the length' : k === 'y' ? 'Across the width' : 'Height it rests at'}>
          <span className="label">{k === 'x' ? 'X' : k === 'y' ? 'Y' : 'Z'}</span>
          <MeasureInput unit="cm" step={1} value={selComp[k]} onChange={(e) => api.patchCompartment(bag.id, selComp.id, { [k]: Number(e.target.value) })} aria-label={`${selComp.name} ${k === 'z' ? 'height' : k.toUpperCase()} in ${lenUnit()}`} />
        </label>
      ))}
      <button className="btn text" onClick={() => api.rotateCompartment(bag.id, selComp.id)} title="Rotate (R)"><Icon name="rotate" />Rotate<kbd>R</kbd></button>
    </div>
  )
}
