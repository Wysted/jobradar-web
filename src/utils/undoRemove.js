import { pushToast } from '../composables/useToasts'

// Immutable insert clamped to the list bounds.
export function insertAt(list, index, item) {
  const at = Math.min(Math.max(index, 0), list.length)
  return [...list.slice(0, at), item, ...list.slice(at)]
}

/**
 * Toast with "Deshacer" for a removed list item; undo puts it back at its original index.
 * `getList` is read at undo time (the list may have changed since); `setList` receives a new array.
 * `same(a, b)` compares by stable identity (`_key` or the tag text), so undo never duplicates.
 * Returning null from `getList` means the owner is gone: nothing to restore.
 */
export function offerRestore({ message, getList, setList, index, item, same }) {
  pushToast({
    message,
    action: {
      label: 'Deshacer',
      onClick: () => {
        const list = getList()
        if (!list || list.some((x) => same(x, item))) return
        setList(insertAt(list, index, item))
      },
    },
  })
}
