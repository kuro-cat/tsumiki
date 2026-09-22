# Bin-pack

Packing planner. Enter your bags (interior L × W × H, empty weight, limit) and items (dimensions, weight), draw a trip's packing as an architect's plan, and see fill, weight, and margin before you leave.

- **Plan**: pick a bag, drag items from the schedule into the true-scale plan of its compartments. A rigid item's footprint appears at scale the moment the drag starts, snaps to the 1 cm grid, and settles on top of whatever it overlaps. A soft item dropped on a compartment is packed loose there; the room it takes is drawn as hatching in the gaps and summed in a per-compartment gauge, red when over volume. `R` turns and `T` tips a rigid item onto its next face, while dragging or with it selected, unless the item is marked this side up; `Delete` removes. A container (packing cube) is placed like a rigid item and takes soft items dropped onto it, up to what it holds. A section-cut slider peels layers at bag-absolute height; the 3D toggle shows the assembled bag as a rotatable line drawing with iso/top/front/side buttons. **Auto-pack** packs the remaining checklist items. **Assemble** mode drags compartments into place to build the bag.
- **Inventory / Bags**: the item and bag schedules. Items are rigid (L × W × H, optionally this side up), soft (litres and a packs-to percentage), or containers (a rigid box that holds litres of soft items). Bags are one or more compartments, Main first. Presets are approximate interior sizes; edit them.
- **Trips**: one or more bags, plus dates, weather, kind of trip, and activities that produce a rule-based checklist matched against your inventory. Each checklist entry links to one or more inventory items, guessed from keywords until you pin it, and counts as packed when the packed units reach its quantity; Auto-pack takes what the list asks for. The header picks which bag the plan shows; a strip above the schedule totals each bag. Drop an item on the strip's Worn tab to wear it instead: it counts as packed and weighs nothing in any bag. A wordless postmark appears when the checklist is packed, every bag is under its limit, and nothing is over volume. With a Claude API key (Data tab) you can ask for destination-specific extras; everything works without one.
- **Data**: JSON export/import, API key, remove sample data. Everything is stored in the browser.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # packing and suggestion rules
npm run build    # static site in dist/
```

Packing uses an extreme-point first-fit heuristic (`src/lib/pack.ts`): six orientations unless an item is this side up, lowest resting height then as-measured wins, largest volume first, gravity settle, tightest compartment wins. Soft items are volume, not position: their packed volume is poured into the free space of their compartment from the floor up, and the resulting height is what the section and 3D views show. See `CONTEXT.md` and `docs/adr/`.
