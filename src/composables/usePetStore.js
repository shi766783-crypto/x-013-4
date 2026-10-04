import { computed, reactive, watch } from 'vue'
import { achievementDefinitions, createDemoState, daysFromToday, isThisWeek, normalRanges, todayISO, uid } from '../data'

const STORAGE_KEY = 'petcare-home-state'
const saved = localStorage.getItem(STORAGE_KEY)
const state = reactive(saved ? JSON.parse(saved) : createDemoState())

// 兼容旧版本存档：没有 completions 字段时补上
if (!state.completions) state.completions = {}

// 清除非今天的完成记录：完成状态按日期记录，第二天自动恢复未完成
function pruneStaleCompletions() {
  const today = todayISO()
  Object.keys(state.completions).forEach((key) => {
    if (!key.endsWith(`:${today}`)) delete state.completions[key]
  })
}
pruneStaleCompletions()

watch(state, (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)), { deep: true })

// 喂食计划每餐的展开数量
const feedingMealCount = (item) => Number(item.times || 1)
const taskKey = (kind, id) => `${kind}:${id}:${todayISO()}`

export function usePetStore() {
  const petById = (id) => state.pets.find((pet) => pet.id === id)
  const petName = (id) => petById(id)?.name || '未命名宠物'
  const totalActivity = computed(() => state.activities.filter((item) => isThisWeek(item.date)).reduce((sum, item) => sum + Number(item.duration || 0), 0))
  const isTaskDone = (kind, id) => !!state.completions[taskKey(kind, id)]
  function toggleTask(kind, id) {
    const key = taskKey(kind, id)
    if (state.completions[key]) delete state.completions[key]
    else state.completions[key] = true
  }
  // 未来 7 天内（含已逾期）的疫苗始终计入提醒；逾期疫苗不允许勾选完成，今天到期且已完成的才剔除
  const pendingVaccines = computed(() => state.vaccines.filter((item) => {
    const days = daysFromToday(item.nextDate)
    if (days > 7) return false
    return days !== 0 || !isTaskDone('vaccine', item.id)
  }).length)
  const feedingTaskTotal = computed(() => state.feedings.reduce((sum, item) => sum + feedingMealCount(item), 0))
  const feedingTasksDone = computed(() => state.feedings.reduce((sum, item) => sum + Array.from({ length: feedingMealCount(item) }, (_, index) => isTaskDone('feeding', `${item.id}-${index}`)).filter(Boolean).length, 0))
  // 今日待喂食：今天还没喂的餐数
  const feedingTasks = computed(() => Math.max(feedingTaskTotal.value - feedingTasksDone.value, 0))
  const medicationsToday = computed(() => state.medications.filter((item) => item.startDate <= todayISO() && item.endDate >= todayISO()).length)
  // 今日待喂药：当前疗程中、今天还没喂的药
  const medicationsPending = computed(() => state.medications.filter((item) => item.startDate <= todayISO() && item.endDate >= todayISO() && !isTaskDone('medication', item.id)).length)
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

  function add(itemType, payload) {
    state[itemType].unshift({ id: uid(itemType.slice(0, -1)), ...payload })
  }
  function addPet(payload) {
    add('pets', payload)
  }
  function resetDemo() {
    const fresh = createDemoState()
    Object.keys(fresh).forEach((key) => {
      if (Array.isArray(state[key])) state[key].splice(0, state[key].length, ...fresh[key])
      else state[key] = { ...fresh[key] }
    })
  }

  return { state, petById, petName, totalActivity, pendingVaccines, feedingTasks, feedingTaskTotal, feedingTasksDone, medicationsToday, medicationsPending, isTaskDone, toggleTask, achievements, healthCompleteness, weightCompliance, add, addPet, resetDemo }
}
