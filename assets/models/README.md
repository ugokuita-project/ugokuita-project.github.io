# UGOKUITA intro model

Source: https://github.com/acaValkyrie/ugokuita-adventure-uec/blob/58903234262c48b1bb5ea9f3d6118f6ba9926c73/assets/ugokuita-neo.glb

The project owner requested reuse of this model. Geometry is from the source GLB, not a hand-drawn substitute. Source file: 64,454,500 bytes. Optimized file: approximately 2.92 MB.

The source uses front casters and rear traction wheels (see upstream `car.tscn`). All four wheels roll in the intro; this does not claim four-wheel drive. Front wheel radius is 0.079 m, rear 0.114 m. Wheel meshes are partitioned from the pinned model's node IDs; the static frame, wheel supports, and other hardware remain fixed. The GLB's axle direction is Z and forward direction is X.

The CAD model contains an open upper frame. At the project owner's request, the web scene adds a thin silver deck matching the header photo, fitted to the model frame (0.635 x 0.463 m). This panel is a presentation reconstruction, not part of the source CAD. Web rendering adjusts CAD material swatches and surface properties for dark polymer, rubber and metallic frame surfaces.

## Rebuild

Run `npm ci`, download the pinned source above to a temporary path, then:

```sh
node scripts/prepare-intro-model.mjs /tmp/ugokuita-neo-source.glb /tmp/ugokuita-partitioned.glb
npx gltf-transform optimize /tmp/ugokuita-partitioned.glb assets/models/ugokuita-neo.glb --flatten false --join false --instance false --palette false --simplify-error 0.001 --compress meshopt
npm run build:intro
```

The committed bundle includes Three.js and Meshopt decoding. The model loads only with motion enabled. Network/WebGL failure falls back to the static website, and the render loop stops after the intro. The replay button reruns the same animation without downloading the model again.
