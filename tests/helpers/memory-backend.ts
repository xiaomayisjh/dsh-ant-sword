import type { KvFacet, KvUnit, KvUnitDescriptor, StorageBackend } from '@deepseek-ai/dsh-storage'

interface Medium {
  readonly version: number
  readonly tables: Map<string, Map<string, unknown>>
  global: unknown
}

/** In-memory storage medium for tests that exercise the real domain facility. */
export class MemoryStorageBackend implements StorageBackend {
  private readonly media = new Map<string, Medium>()
  private readonly openUnits = new Set<string>()

  readonly kv: KvFacet = {
    open: async (descriptor: KvUnitDescriptor): Promise<KvUnit> => {
      if (this.openUnits.has(descriptor.name)) throw new Error(`unit ${descriptor.name} is already open`)
      let medium = this.media.get(descriptor.name)
      if (medium === undefined) {
        medium = { version: descriptor.version, tables: new Map(), global: null }
        this.media.set(descriptor.name, medium)
      }
      if (medium.version !== descriptor.version) throw new Error(`unit ${descriptor.name} has a different version`)
      this.openUnits.add(descriptor.name)
      let closed = false
      const assertOpen = () => {
        if (closed) throw new Error(`unit ${descriptor.name} is closed`)
      }
      return {
        loadAll: async () => {
          assertOpen()
          const tables: Record<string, Record<string, unknown>> = {}
          for (const table of descriptor.tables) tables[table] = Object.fromEntries(medium.tables.get(table) ?? [])
          return { tables, global: medium.global }
        },
        putRecord: async (table, key, value) => {
          assertOpen()
          let records = medium.tables.get(table)
          if (records === undefined) {
            records = new Map()
            medium.tables.set(table, records)
          }
          records.set(key, value)
        },
        deleteRecord: async (table, key) => {
          assertOpen()
          medium.tables.get(table)?.delete(key)
        },
        setGlobal: async value => {
          assertOpen()
          medium.global = value
        },
        close: async () => {
          closed = true
          this.openUnits.delete(descriptor.name)
        },
      }
    },
  }

  async close(): Promise<void> {
    this.openUnits.clear()
  }
}
