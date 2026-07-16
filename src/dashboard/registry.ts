import type { AnyTileDefinition, TileDefinition } from './types'

const registry = new Map<string, AnyTileDefinition>()

/** Called once per tile module, imported (as a side effect) by tiles/index.ts. */
export function registerTile<TSettings extends Record<string, unknown>>(def: TileDefinition<TSettings>): void {
  if (registry.has(def.type)) {
    throw new Error(`Tile type "${def.type}" is already registered.`)
  }
  registry.set(def.type, def as AnyTileDefinition)
}

export function getTileDefinition(type: string): AnyTileDefinition | undefined {
  return registry.get(type)
}

export function listTileDefinitions(): AnyTileDefinition[] {
  return Array.from(registry.values())
}
