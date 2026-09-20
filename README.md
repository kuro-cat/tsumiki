# Soubi

Packing planner. Enter your bags (interior L × W × H, empty weight, limit) and items (dimensions, weight), draw a trip's packing as an architect's plan, and see fill, weight, and margin before you leave.

- **Plan**: pick a bag, drag items from the schedule into the true-scale plan. The footprint appears at scale the moment the drag starts, snaps to the 1 cm grid, and settles on top of whatever it overlaps. `R` rotates while dragging or with an item selected; `Delete` removes. A section-cut slider peels layers; the 3D toggle shows the same placements as a rotatable line drawing. **Auto-pack** places the remaining checklist items.
- **Inventory / Bags**: the item and bag schedules. Bag presets are approximate interior sizes; edit them.
- **Trips**: dates, weather, kind of trip, and activities produce a rule-based checklist matched against your inventory. With a Claude API key (Data tab) you can ask for destination-specific extras; everything works without one.
- **Data**: JSON export/import, API key, remove sample data. Everything is stored in the browser.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # packing and suggestion rules
npm run build    # static site in dist/
```

Packing uses an extreme-point first-fit heuristic (`src/lib/pack.ts`): items stay upright, two plan rotations, largest volume first, gravity settle. Soft items are modeled as rigid boxes.
