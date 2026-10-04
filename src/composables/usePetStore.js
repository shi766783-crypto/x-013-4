import { computed, reactive, watch } from 'vue'
import { achievementDefinitions, createDemoState, daysFromToday, isThisWeek, normalRanges, todayISO, uid } from '../data'

const STORAGE_KEY = 'petcare-home-state'
const saved = localStorage.getItem(STORAGE_KEY)
const state = reactive(saved ? JSON.parse(saved) : createDemoState())
if (!state.taskCompletions) state.taskCompletions = {}

watch(state, (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)), { deep: true })

export const feedingTaskId = (feedingId, index) => `feeding:${feedingId}:${index}`
export const medicationTaskId = (medicationId) => `medication:${medicationId}`
export const vaccineTaskId = (vaccineId) => `vaccine:${vaccineId}`

export function usePetStore() {
  const petById = (id) => state.pets.find((pet) => pet.id === id)
  const petName = (id) => petById(id)?.name || '未命名宠物'
  const totalActivity = computed(() => state.activities.filter((item) => isThisWeek(item.date)).reduce((sum, item) => sum + Number(item.duration || 0), 0))
  const isTaskCompleted = (taskId, date = todayISO()) => Boolean(state.taskCompletions[date]?.[taskId])
  const canCompleteTask = (task) => task.kind !== 'vaccine' || task.days === 0
  const pendingVaccines = computed(() => state.vaccines.filter((item) => {
    const days = daysFromToday(item.nextDate)
    return days <= 7 && !(days === 0 && isTaskCompleted(vaccineTaskId(item.id)))
  }).length)
  const feedingTasks = computed(() => state.feedings.reduce((sum, item) => (
    sum + Array.from({ length: Number(item.times || 0) })
      .filter((_, index) => !isTaskCompleted(feedingTaskId(item.id, index)))
      .length
  ), 0))
  const medicationsToday = computed(() => state.medications.filter((item) => (
    item.startDate <= todayISO()
    && item.endDate >= todayISO()
    && !isTaskCompleted(medicationTaskId(item.id))
  )).length)
  const achievements = computed(() => achievementDefinitions.map((item) => ({ ...item, unlocked: item.condition(state) })))
  const healthCompleteness = (petId) => {
    const fields = ['weight', 'temperature', 'heartRate']
    const count = fields.filter((type) => state.healthRecords.some((item) => item.petId === petId && item.type === type)).length
    return Math.round((count / fields.length) * 100)
  }
  const weightCompliance = (petId) => {
    const records = state.healthRecords.filter((item) => item.petId === petId && item.type === 'weight')
    if (!records.length) return 0
    return Math.round((records.filter((item) => item.value >= normalRanges.weight.min && item.value <= normalRanges.weight.max).length / records.length) * 100)
  }

  function setTaskCompleted(task, completed, date = todayISO()) {
    if (!task?.id || !canCompleteTask(task)) return
    if (!state.taskCompletions[date]) state.taskCompletions[date] = {}
    if (completed) {
      state.taskCompletions[date][task.id] = true
    } else {
      delete state.taskCompletions[date][task.id]
      if (!Object.keys(state.taskCompletions[date]).length) delete state.taskCompletions[date]
    }
  }
  function toggleTask(task, date = todayISO()) {
    if (!task?.id) return
    setTaskCompleted(task, !isTaskCompleted(task.id, date), date)
  }
  function add(itemType, payload) {
    state[itemType].unshift({ id: uid(itemType.slice(0, -1)), ...payload })
  }
  function addPet(payload) {
    add('pets', payload)
  }
  function resetDemo() {
    const fresh = createDemoState()
    Object.keys(state).forEach((key) => {
      if (Array.isArray(state[key])) {
        state[key].splice(0, state[key].length, ...(fresh[key] || []))
      } else {
        state[key] = fresh[key] || {}
      }
    })
  }

  return { state, petById, petName, totalActivity, pendingVaccines, feedingTasks, medicationsToday, achievements, healthCompleteness, weightCompliance, isTaskCompleted, canCompleteTask, setTaskCompleted, toggleTask, add, addPet, resetDemo }
}
