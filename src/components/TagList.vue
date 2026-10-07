<script setup>
import { inject, onBeforeUnmount, ref, useId, watch } from 'vue'
import { offerRestore } from '../utils/undoRemove'

const props = defineProps({
  modelValue: { type: Array, required: true },
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  // Optional id of an external FieldError describing this input, plus its invalid state.
  errorId: { type: String, default: '' },
  invalid: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

// Optional form-level registry (provided by ProfileView) so unsaved typed text is never lost.
const registry = inject('tagListRegistry', null)

const uid = useId()
const inputId = `${uid}-input`
const hintId = `${uid}-hint`
const input = ref('')

// Add one or many values (comma separated) in a single emit; skips blanks and duplicates.
function addValues(raw) {
  const incoming = raw.split(',').map((v) => v.trim()).filter(Boolean)
  const next = [...props.modelValue]
  for (const v of incoming) if (!next.includes(v)) next.push(v)
  if (next.length !== props.modelValue.length) emit('update:modelValue', next)
}

function add() {
  addValues(input.value)
  input.value = ''
}

// Comma anywhere (typed, pasted, mobile keyboards) commits what precedes it.
function onInput(e) {
  input.value = e.target.value
  if (!input.value.includes(',')) return
  const parts = input.value.split(',')
  const rest = parts.pop()
  addValues(parts.join(','))
  input.value = rest.trimStart()
}

// Removal always offers "Deshacer": the tag returns to its original position.
function removeAt(index) {
  const tag = props.modelValue[index]
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
  offerRestore({
    message: `Se quitó «${tag}» de ${props.label}.`,
    getList: () => props.modelValue,
    setList: (next) => emit('update:modelValue', next),
    index,
    item: tag,
    same: (a, b) => a === b,
  })
}

function onBackspace() {
  if (input.value !== '' || !props.modelValue.length) return
  removeAt(props.modelValue.length - 1)
}

function remove(tag) {
  removeAt(props.modelValue.indexOf(tag))
}

if (registry) {
  registry.register(uid, add)
  watch(input, (v) => registry.setPending(uid, v.trim() !== ''))
  onBeforeUnmount(() => registry.unregister(uid))
}
</script>

<template>
  <div class="min-w-0">
    <label :for="inputId" class="field-label">{{ label }}</label>
    <div
      class="rounded-md border border-border-strong bg-surface p-1 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40"
    >
      <ul v-if="modelValue.length" class="flex flex-wrap gap-1 p-0.5" :aria-label="label">
        <li
          v-for="tag in modelValue"
          :key="tag"
          class="chip max-w-full py-0 pl-2 pr-0.5"
        >
          <span class="truncate">{{ tag }}</span>
          <button
            type="button"
            class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface hover:text-danger"
            :aria-label="`Quitar ${tag}`"
            @click="remove(tag)"
          >
            <svg viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="m4.5 4.5 7 7m0-7-7 7" stroke-linecap="round" />
            </svg>
          </button>
        </li>
      </ul>
      <input
        :id="inputId"
        :value="input"
        :aria-describedby="[hint ? hintId : '', invalid && errorId ? errorId : ''].filter(Boolean).join(' ') || undefined"
        :aria-invalid="invalid ? 'true' : undefined"
        placeholder="Escribe y presiona Enter o coma"
        class="block w-full rounded bg-transparent px-1.5 py-1 text-sm text-text placeholder:text-text-muted focus:outline-none"
        @keydown.enter.prevent="!$event.isComposing && add()"
        @keydown.backspace="onBackspace"
        @input="onInput"
      />
    </div>
    <span v-if="hint" :id="hintId" class="field-hint">{{ hint }}</span>
  </div>
</template>
