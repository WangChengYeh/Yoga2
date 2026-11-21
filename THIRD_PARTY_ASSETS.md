# Third-party assets

## Michelle character

- Source: [three.js r180, Michelle.glb](https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/Michelle.glb)
- Original character: Adobe Mixamo Michelle.
- Build-time local copy: `public/models/michelle.glb` (3,276,888 bytes); excluded from Git. `scripts/prepare-model.mjs` downloads the pinned upstream file and verifies its SHA-256 before bundling it into this interactive prototype.
- Used as a temporary character for this personal prototype. The source project's software license is not a new license grant for the character; consult [Mixamo's terms and FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) before any further redistribution or commercial asset use.
- The embedded dance animation is not played. The app applies its own simple arm-raising preview to the existing skeleton. This preview has not been reviewed as professional yoga instruction.

## Three.js

- Version: 0.180.0, MIT license, copyright Three.js authors.
- The build includes the upstream license at `dist/vendor/THREE-LICENSE.txt`.
- Browser modules are served from the same origin; no third-party JavaScript CDN is required.
