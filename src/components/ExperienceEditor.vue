<script setup>
import { nextTick } from 'vue'
import FieldError from './FieldError.vue'
import TagList from './TagList.vue'
import { describedBy, errorId, fieldId, newKey } from '../utils/profileForm'
import { offerRestore } from '../utils/undoRemove'

const props = defineProps({
  modelValue: { type: Array, required: true },
  // Visible errors by path (paths use item _key): { 'experiences.<key>.company': 'msg' }
  errors: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue', 'touch'])

const update = (next) => emit('update:modelValue', next)
const touch = (path) => emit('touch', path)
const value = (e) => e.target.value

function add() {
  const exp = {
    _key: newKey(),
    id: null,
    company: '',
    role: '',
    location: '',
    subtitle: '',
    dates: '',
    start: null,
    end: null,
    is_current: false,
    areas: [],
    technologies: [],
    achievements: [],
  }
  update([...props.modelValue, exp])
  nextTick(() => document.getElementById(fieldId(`experiences.${exp._key}.role`))?.focus())
}


const patch = (key, changes) =>
  update(props.modelValue.map((e) => (e._key === key ? { ...e, ...changes } : e)))

const sameKey = (a, b) => a._key === b._key

function remove(key) {
  const index = props.modelValue.findIndex((e) => e._key === key)
  if (index < 0) return
  const item = props.modelValue[index]
  update(props.modelValue.filter((e) => e._key !== key))
  offerRestore({
    message: 'Experiencia eliminada.',
    getList: () => props.modelValue,
    setList: update,
    index,
    item,
    same: sameKey,
  })
}

function addAchievement(exp) {
  const ach = { _key: newKey(), text: '', tags: [] }
  patch(exp._key, { achievements: [...exp.achievements, ach] })
  nextTick(() => document.getElementById(fieldId(`experiences.${exp._key}.achievements.${ach._key}.text`))?.focus())
}

function removeAchievement(exp, achKey) {
  const index = exp.achievements.findIndex((a) => a._key === achKey)
  if (index < 0) return
  const item = exp.achievements[index]
  patch(exp._key, { achievements: exp.achievements.filter((a) => a._key !== achKey) })
  offerRestore({
    message: 'Logro eliminado.',
    // Read the experience again at undo time; if it was removed meanwhile there is nothing to restore into.
    getList: () => props.modelValue.find((e) => e._key === exp._key)?.achievements ?? null,
    setList: (next) => patch(exp._key, { achievements: next }),
    index,
    item,
    same: sameKey,
  })
}

const patchAchievement = (exp, achKey, changes) =>
  patch(exp._key, {
    achievements: exp.achievements.map((a) => (a._key === achKey ? { ...a, ...changes } : a)),
  })

const path = (exp, name) => `experiences.${exp._key}.${name}`
const fid = (exp, name) => fieldId(path(exp, name))
const achPath = (exp, ach) => `experiences.${exp._key}.achievements.${ach._key}.text`
const idx = (exp) => props.modelValue.findIndex((e) => e._key === exp._key) + 1
</script>

<template>
  <div class="min-w-0">
    <ol class="space-y-4">
      <li
        v-for="exp in modelValue"
        :key="exp._key"
        class="rounded-lg border border-border bg-surface"
      >
        <div class="flex items-center gap-3 border-b border-border px-3 py-2">
          <p class="min-w-0 flex-1 truncate text-sm font-semibold text-text">
            {{ exp.role || 'Rol sin nombre' }}
            <span class="font-normal text-text-muted">· {{ exp.company || 'Empresa sin nombre' }}</span>
          </p>
          <button
            type="button"
            class="btn btn-ghost px-2 hover:text-danger"
            :aria-label="`Eliminar experiencia ${exp.role || idx(exp)}`"
            @click="remove(exp._key)"
          >
            Eliminar
          </button>
        </div>

        <div class="space-y-4 p-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label :for="fieldId(path(exp, 'role'))" class="field-label">Rol <span class="text-danger" aria-hidden="true">*</span></label>
              <input
                :id="fieldId(path(exp, 'role'))"
                :value="exp.role"
                aria-required="true"
                :aria-invalid="errors[path(exp, 'role')] ? 'true' : undefined"
                :aria-describedby="describedBy(path(exp, 'role'), errors)"
                class="input"
                @input="patch(exp._key, { role: value($event) })"
                @blur="touch(path(exp, 'role'))"
              />
              <FieldError :id="errorId(path(exp, 'role'))" :message="errors[path(exp, 'role')]" />
            </div>
            <div>
              <label :for="fieldId(path(exp, 'company'))" class="field-label">Empresa <span class="text-danger" aria-hidden="true">*</span></label>
              <input
                :id="fieldId(path(exp, 'company'))"
                :value="exp.company"
                aria-required="true"
                :aria-invalid="errors[path(exp, 'company')] ? 'true' : undefined"
                :aria-describedby="describedBy(path(exp, 'company'), errors)"
                class="input"
                @input="patch(exp._key, { company: value($event) })"
                @blur="touch(path(exp, 'company'))"
              />
              <FieldError :id="errorId(path(exp, 'company'))" :message="errors[path(exp, 'company')]" />
            </div>
            <div>
              <label :for="fid(exp, 'location')" class="field-label">Ubicación</label>
              <input :id="fid(exp, 'location')" :value="exp.location" class="input" @input="patch(exp._key, { location: value($event) })" />
            </div>
            <div>
              <label :for="fid(exp, 'subtitle')" class="field-label">Subtítulo</label>
              <input :id="fid(exp, 'subtitle')" :value="exp.subtitle" placeholder="Remoto, part-time..." class="input" @input="patch(exp._key, { subtitle: value($event) })" />
            </div>
            <div class="sm:col-span-2">
              <label :for="fid(exp, 'dates')" class="field-label">Fechas como se muestran en el CV</label>
              <input :id="fid(exp, 'dates')" :value="exp.dates" placeholder="Ene 2020 - Actualidad" maxlength="200" class="input" @input="patch(exp._key, { dates: value($event) })" />
            </div>
            <div>
              <label :for="fid(exp, 'start')" class="field-label">Inicio</label>
              <input :id="fid(exp, 'start')" :value="exp.start" placeholder="AAAA-MM" inputmode="numeric" class="input input-num" @input="patch(exp._key, { start: value($event) })" />
            </div>
            <div>
              <label :for="fid(exp, 'end')" class="field-label">Término</label>
              <input
                :id="fid(exp, 'end')"
                :value="exp.end"
                @input="patch(exp._key, { end: value($event) })"
                placeholder="AAAA-MM"
                inputmode="numeric"
                :aria-describedby="fid(exp, 'end-hint')"
                class="input input-num"
              />
              <span :id="fid(exp, 'end-hint')" class="field-hint">Vacío si es tu trabajo actual.</span>
            </div>
          </div>

          <label class="flex min-h-[2rem] cursor-pointer items-center gap-2 text-sm text-text">
            <input :checked="exp.is_current" type="checkbox" class="h-4 w-4" @change="patch(exp._key, { is_current: $event.target.checked })" />
            Es mi trabajo actual
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <TagList :model-value="exp.areas" label="Áreas" @update:model-value="patch(exp._key, { areas: $event })" />
            <TagList :model-value="exp.technologies" label="Tecnologías" @update:model-value="patch(exp._key, { technologies: $event })" />
          </div>

          <fieldset>
            <legend class="field-label">Logros</legend>
            <ol class="space-y-3">
              <li
                v-for="(ach, ai) in exp.achievements"
                :key="ach._key"
                class="space-y-2 rounded-md bg-surface-2 p-2.5"
              >
                <div class="flex items-start gap-2">
                  <div class="min-w-0 flex-1">
                    <label :for="fieldId(achPath(exp, ach))" class="sr-only">Logro {{ ai + 1 }}</label>
                    <textarea
                      :id="fieldId(achPath(exp, ach))"
                      :value="ach.text"
                      rows="3"
                      aria-required="true"
                      :aria-invalid="errors[achPath(exp, ach)] ? 'true' : undefined"
                      :aria-describedby="describedBy(achPath(exp, ach), errors)"
                      placeholder="Qué lograste y con qué impacto"
                      class="input"
                      @input="patchAchievement(exp, ach._key, { text: value($event) })"
                      @blur="touch(achPath(exp, ach))"
                    ></textarea>
                    <FieldError :id="errorId(achPath(exp, ach))" :message="errors[achPath(exp, ach)]" />
                  </div>
                  <button
                    type="button"
                    class="icon-btn hover:text-danger"
                    :aria-label="`Eliminar logro ${ai + 1}`"
                    @click="removeAchievement(exp, ach._key)"
                  >
                    <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" stroke-linecap="round" /></svg>
                  </button>
                </div>
                <TagList
                  :model-value="ach.tags"
                  :label="`Tags del logro ${ai + 1}`"
                  @update:model-value="patchAchievement(exp, ach._key, { tags: $event })"
                />
              </li>
            </ol>
            <p v-if="!exp.achievements.length" class="text-meta text-text-muted">Sin logros todavía.</p>
            <button
              type="button"
              class="btn btn-ghost mt-2 -ml-2 text-accent hover:text-accent"
              @click="addAchievement(exp)"
            >
              <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke-linecap="round" /></svg>
              Agregar logro
            </button>
          </fieldset>
        </div>
      </li>
    </ol>

    <p v-if="!modelValue.length" class="text-meta text-text-muted">Sin experiencias todavía.</p>
    <button type="button" class="btn btn-secondary mt-3" @click="add">
      <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke-linecap="round" /></svg>
      Agregar experiencia
    </button>
  </div>
</template>
