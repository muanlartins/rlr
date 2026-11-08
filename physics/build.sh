#!/usr/bin/env bash
# Builds RocketSim (github.com/ZealanL/RocketSim, MIT) for the browser into
# src/physics/rocketsim.{mjs,wasm}, which are committed: the site's build has
# no Emscripten. Needs emsdk's environment (`source <emsdk>/emsdk_env.sh`).
#
#   physics/build.sh
set -euo pipefail
cd "$(dirname "$0")"

COMMIT=c2baacb8f4b441dd8505e63c2aeb5a1679b60b02
SRC=.rocketsim
if [ ! -d "$SRC" ]; then
  git clone -q https://github.com/ZealanL/RocketSim.git "$SRC"
fi
git -C "$SRC" fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$SRC" checkout -q "$COMMIT"

OBJ=.obj
mkdir -p "$OBJ"
FLAGS=(-O3 -std=c++20 -fexceptions -DNDEBUG -I"$SRC/src")

# One object per source, rebuilt only when the source is newer.
objects=()
while IFS= read -r file; do
  object="$OBJ/$(echo "${file#$SRC/}" | tr '/' '_').o"
  objects+=("$object")
  if [ ! -f "$object" ] || [ "$file" -nt "$object" ]; then
    em++ "${FLAGS[@]}" -c "$file" -o "$object" &
    while [ "$(jobs -r | wc -l)" -ge "${JOBS:-4}" ]; do wait -n; done
  fi
done < <(find "$SRC/src" "$SRC/libsrc/bullet3-3.24" -name '*.cpp' | sort)
wait

em++ "${FLAGS[@]}" rlr_sim.cpp "${objects[@]}" -o ../src/physics/rocketsim.mjs \
  -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=web,worker \
  -sALLOW_MEMORY_GROWTH -sINITIAL_MEMORY=64MB \
  -sEXPORTED_FUNCTIONS=_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPF32,HEAP32
ls -la ../src/physics/rocketsim.*
