# Tsumiki

*Packing shouldn't be NP-hard.*

Tsumiki (積み木, Japanese for "building blocks") is a packing planner. Add your bags and the things you own, and see how a trip fits before you leave: a to-scale drawing of each bag, how full it is, and how much it weighs.

## What it does

- **Trip checklists.** Pick dates, weather and activities, and get a packing list matched to your own things.
- **Pack on a drawing.** Drag items into a to-scale plan of your bag, or press Auto-pack. Switch to 3D to look around.
- **Weight and space.** Check each bag against its weight limit, including a cabin allowance shared between bags, and keep room free for souvenirs.
- **Wear it instead.** Things you'll wear count as packed but add no weight to a bag.
- **Reuse.** Save a trip as a template, or duplicate last year's trip.
- **Share.** Turn a packed trip into a picture to send.
- **AI extras (optional).** Ask an AI model for things to bring for your destination, using your own API key.

A sample trip to Lisbon is loaded the first time you open it. Press Auto-pack to finish packing it.

## Your data

Everything stays in your browser. There's no account, and nothing is uploaded. Export a backup from the Data tab. Tsumiki works offline once loaded and can be installed as an app from your browser's menu. Metric or imperial, on a phone or a computer.

## Run it yourself

You need [Node.js](https://nodejs.org).

```sh
npm install
npm run dev     # open http://localhost:5173
npm run build   # static site in dist/, ready to host anywhere
```

AI extras work with Anthropic (Claude) or any OpenAI-compatible provider, such as OpenRouter, Ollama or LM Studio. Some providers, OpenCode for one, don't accept requests from a web page. Those only work when you run Tsumiki on your own computer with `npm run dev` or `npm run preview`.

## License

MIT. See [LICENSE](LICENSE).
