<script setup>
import { nextTick } from 'vue'
import FieldError from './FieldError.vue'
import TagList from './TagList.vue'
import { describedBy, errorId, fieldId, newKey } from '../utils/profileForm'
import { offerRestore } from '../utils/undoRemove'

const props = defineProps({
  modelValue: { type: Array, required: true },
  // Visible errors by path (paths use item _key): { 'education.<key>.degree': 'msg' }
  errors: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue', 'touch'])

const update = (next) => emit('update:modelValue', next)
const touch = (path) => emit('touch', path)
const value = (e) => e.target.value

const path = (edu, name) => `education.${edu._key}.${name}`
const fid = (edu, name) => fieldId(path(edu, name))
const idx = (edu) => props.modelValue.findIndex((e) => e._key === edu._key) + 1

function add() {
  const edu = {
    _key: newKey(),
    institution: '',
    location: '',
    degree: '',
    dates: '',
    start: null,
    end: null,
    details: [],
  }
  update([...props.modelValue, edu])
  nextTick(() => document.getElementById(fid(edu, 'degree'))?.focus())
}

function remove(key) {
  const index = props.modelValue.findIndex((e) => e._key === key)
  if (index < 0) return
  const item = props.modelValue[index]
  update(props.modelValue.filter((e) => e._key !== key))
  offerRestore({
    message: 'Educación eliminada.',
    getList: () => props.modelValue,
    setList: update,
    index,
    item,
    same: (a, b) => a._key === b._key,
  })
}

const patch = (key, changes) =>
  update(props.modelValue.map((e) => (e._key === key ? { ...e, ...changes } : e)))
</script>

<template>
  <div class="min-w-0">
    <ol class="space-y-4">
      <li
        v-for="edu in modelValue"
        :key="edu._key"
        class="rounded-lg border border-border bg-surface"
      >
        <div class="flex items-center gap-3 border-b border-border px-3 py-2">
          <p class="min-w-0 flex-1 truncate text-sm font-semibold text-text">
            {{ edu.degree || 'Título sin nombre' }}
            <span class="font-normal text-text-muted">· {{ edu.institution || 'Institución sin nombre' }}</span>
          </p>
          <button
            type="button"
            class="btn btn-ghost px-2 hover:text-danger"
            :aria-label="`Eliminar educación ${edu.degree || idx(edu)}`"
            @click="remove(edu._key)"
          >
            Eliminar
          </button>
        </div>

        <div class="space-y-4 p-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label :for="fid(edu, 'degree')" class="field-label">Título o grado <span class="text-danger" aria-hidden="true">*</span></label>
              <input
                :id="fid(edu, 'degree')"
                :value="edu.degree"
                aria-required="true"
                :aria-invalid="errors[path(edu, 'degree')] ? 'true' : undefined"
                :aria-describedby="describedBy(path(edu, 'degree'), errors)"
                class="input"
                @input="patch(edu._key, { degree: value($event) })"
                @blur="touch(path(edu, 'degree'))"
              />
              <FieldError :id="errorId(path(edu, 'degree'))" :message="errors[path(edu, 'degree')]" />
            </div>
            <div>
              <label :for="fid(edu, 'institution')" class="field-label">Institución <span class="text-danger" aria-hidden="true">*</span></label>
              <input
                :id="fid(edu, 'institution')"
                :value="edu.institution"
                aria-required="true"
                :aria-invalid="errors[path(edu, 'institution')] ? 'true' : undefined"
                :aria-describedby="describedBy(path(edu, 'institution'), errors)"
                class="input"
                @input="patch(edu._key, { institution: value($event) })"
                @blur="touch(path(edu, 'institution'))"
              />
              <FieldError :id="errorId(path(edu, 'institution'))" :message="errors[path(edu, 'institution')]" />
            </div>
            <div>
              <label :for="fid(edu, 'location')" class="field-label">Ubicación</label>
              <input :id="fid(edu, 'location')" :value="edu.location" class="input" @input="patch(edu._key, { location: value($event) })" />
            </div>
            <div>
              <label :for="fid(edu, 'dates')" class="field-label">Fechas como se muestran en el CV</label>
              <input :id="fid(edu, 'dates')" :value="edu.dates" placeholder="2015 - 2019" maxlength="200" class="input" @input="patch(edu._key, { dates: value($event) })" />
            </div>
            <div>
              <label :for="fid(edu, 'start')" class="field-label">Inicio</label>
              <input :id="fid(edu, 'start')" :value="edu.start" placeholder="AAAA-MM" inputmode="numeric" class="input input-num" @input="patch(edu._key, { start: value($event) })" />
            </div>
            <div>
              <label :for="fid(edu, 'end')" class="field-label">Término</label>
              <input :id="fid(edu, 'end')" :value="edu.end" placeholder="AAAA-MM" inputmode="numeric" class="input input-num" @input="patch(edu._key, { end: value($event) })" />
            </div>
          </div>

          <TagList :model-value="edu.details" label="Detalles" @update:model-value="patch(edu._key, { details: $event })" />
        </div>
      </li>
    </ol>

    <p v-if="!modelValue.length" class="text-meta text-text-muted">Sin educación todavía.</p>
    <button type="button" class="btn btn-secondary mt-3" @click="add">
      <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke-linecap="round" /></svg>
      Agregar educación
    </button>
  </div>
</template>
