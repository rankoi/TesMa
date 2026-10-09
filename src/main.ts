import './style.css'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { CapacitorSQLite } from '@capacitor-community/sqlite'
import type { Subject, Task } from './types'

const DB_NAME = 'tesma'
const DEFAULT_SUBJECT_COLOR = '#808080'
const DEFAULT_SUBJECTS: Subject[] = [
  { name: '論理国語', color: '#FF0000' },
  { name: '古典探求', color: '#008000' },
  { name: '英コミュ', color: '#FFC0CB' },
  { name: '論理・表現', color: '#FF8C00' },
  { name: '数学III', color: '#006400' },
  { name: '数学C', color: '#FFFF00' },
  { name: '化学', color: '#00BFFF' },
  { name: '物理', color: '#FFDAB9' },
  { name: '倫政', color: '#800080' },
  { name: '情報', color: '#0000FF' },
  { name: '家庭科', color: '#F5F5F5' },
  { name: '保健 体育', color: '#FF00A6' },
  { name: 'その他', color: DEFAULT_SUBJECT_COLOR },
]
const app = document.querySelector<HTMLDivElement>('#app')!
let tasks: Task[] = []
let subjects: Subject[] = DEFAULT_SUBJECTS.map(subject => ({ ...subject }))
let currentType: Task['type'] = '課題'
let editId: string | null = null
let useLocalStorage = !Capacitor.isNativePlatform()
let sqliteReady = false
let completedOnly = false

app.innerHTML = `
  <header class="topbar"><div class="brand">TesMa<span>学習タスク</span></div><div class="header-actions"><button id="settings" class="topbar-button" type="button">教科設定</button><button id="restore" class="icon-button" aria-label="バックアップを復元" title="バックアップを復元">↧</button><button id="backup" class="icon-button" aria-label="バックアップを共有" title="バックアップを共有">⇧</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div></header>
  <main>
    <section class="hero-card"><h1>課題・小テストを登録</h1><div class="hero-actions"><button class="primary-button" id="new-assignment">＋ 課題を登録</button><button class="secondary-button" id="new-test">＋ 小テストを登録</button></div></section>
    <section class="task-section"><div class="section-heading"><div><p class="eyebrow">YOUR SCHEDULE</p><h2>課題一覧</h2></div><div class="list-controls"><span id="task-count" class="count-pill">0 件</span><button id="completed-filter" class="filter-button" type="button" aria-pressed="false">未完了のみ</button></div></div><div id="task-list" class="task-list"></div></section>
    <p class="sync-note"><span class="sync-dot"></span>端末内に保存済み</p>
  </main>
  <dialog id="task-dialog"><form id="task-form" method="dialog"><div class="dialog-heading"><div><p class="eyebrow">TASK DETAILS</p><h2 id="form-title">課題を追加</h2></div><button type="button" class="close-button" id="close-dialog" aria-label="閉じる">×</button></div><label>教科名<select id="subject" required></select></label><label><span id="content-label">内容</span><textarea id="content" required maxlength="1000" rows="3" placeholder="例：問題集 P20〜25"></textarea></label><div class="form-row"><label><span id="date-label">期限</span><input id="deadline" type="date" required></label><label>何日前に通知<input id="alert-days" type="number" min="0" max="365" value="3" required></label></div><label>リンク（任意）<input id="link" type="url" placeholder="https://..."></label><label>メモ（任意）<input id="memo" maxlength="500" placeholder="補足事項"></label><button class="primary-button save-button" type="submit">保存する</button></form></dialog>
  <dialog id="settings-dialog"><div class="dialog-heading"><div><p class="eyebrow">SUBJECT SETTINGS</p><h2>教科設定</h2></div><button type="button" class="close-button" id="close-settings" aria-label="閉じる">×</button></div><p class="settings-hint">教科名や表示色を変更できます。色を変更しない場合は灰色になります。</p><div id="subject-settings-list" class="subject-settings-list"></div><div class="settings-actions"><button type="button" id="add-subject" class="secondary-action">＋ 教科を追加</button><button type="button" id="save-subjects" class="primary-button">設定を保存</button></div></dialog>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>`

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const localMode = !Capacitor.isNativePlatform()

function parseTaskList(raw: string | null): Task[] {
  if (!raw) return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('保存データの形式が正しくありません。')
  return parsed as Task[]
}

function readCachedTasks(): Task[] {
  try {
    return parseTaskList(localStorage.getItem('tesma.tasks'))
  } catch (error) {
    console.warn('端末保存領域のデータを読み込めません', error)
    return []
  }
}

function normalizeColor(color: string | undefined): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_SUBJECT_COLOR
}

function parseSubjects(raw: string | null): Subject[] {
  if (!raw) return DEFAULT_SUBJECTS.map(subject => ({ ...subject }))
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('教科設定の形式が正しくありません。')
  const valid = parsed.filter((item): item is Subject => !!item && typeof item.name === 'string' && typeof item.color === 'string')
    .map(item => ({ name: item.name.trim(), color: normalizeColor(item.color) }))
    .filter(item => item.name.length > 0)
  return valid.length ? valid : DEFAULT_SUBJECTS.map(subject => ({ ...subject }))
}

function readCachedSubjects(): Subject[] {
  try { return parseSubjects(localStorage.getItem('tesma.subjects')) }
  catch (error) { console.warn('教科設定を読み込めません', error); return DEFAULT_SUBJECTS.map(subject => ({ ...subject })) }
}

async function loadSubjectsFromSQLite(): Promise<Subject[]> {
  const result = await CapacitorSQLite.query({ database: DB_NAME, statement: 'SELECT name, color FROM subjects ORDER BY sort_order', values: [] })
  return (result.values ?? []).map(row => ({ name: String(row.name), color: normalizeColor(String(row.color ?? '')) }))
}

async function initializeDatabase() {
  if (localMode) {
    tasks = readCachedTasks()
    subjects = readCachedSubjects()
    renderTasks()
    return
  }

  try {
    let connectionAlreadyExists = false
    try {
      await CapacitorSQLite.createConnection({ database: DB_NAME, version: 1, encrypted: false, readonly: false })
    } catch (error) {
      if (!String(error).toLowerCase().includes('already exists')) throw error
      connectionAlreadyExists = true
    }
    const opened = connectionAlreadyExists ? await CapacitorSQLite.isDBOpen({ database: DB_NAME }) : { result: false }
    if (!opened.result) await CapacitorSQLite.open({ database: DB_NAME })
    await CapacitorSQLite.execute({ database: DB_NAME, statements: 'CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);' })
    await CapacitorSQLite.execute({ database: DB_NAME, statements: 'CREATE TABLE IF NOT EXISTS subjects (name TEXT PRIMARY KEY, color TEXT NOT NULL, sort_order INTEGER NOT NULL);' })
    sqliteReady = true
    const result = await CapacitorSQLite.query({ database: DB_NAME, statement: 'SELECT data FROM tasks ORDER BY id', values: [] })
    tasks = (result.values ?? []).map(row => JSON.parse(String(row.data)) as Task)
    subjects = await loadSubjectsFromSQLite()
    if (subjects.length === 0) {
      subjects = readCachedSubjects()
      await writeSubjectsToSQLite(subjects)
    }

    // Earlier builds may have saved data to WebView storage before SQLite setup failed.
    if (tasks.length === 0) {
      const cachedTasks = readCachedTasks()
      if (cachedTasks.length > 0) {
        tasks = cachedTasks
        await writeTasksToSQLite(tasks)
      }
    }
    localStorage.setItem('tesma.tasks', JSON.stringify(tasks))
    localStorage.setItem('tesma.subjects', JSON.stringify(subjects))
    await refreshNotifications()
    renderTasks()
  } catch (error) {
    useLocalStorage = true
    tasks = readCachedTasks()
    subjects = readCachedSubjects()
    try { await refreshNotifications() } catch (notificationError) { console.warn('通知予約の更新に失敗しました', notificationError) }
    renderTasks()
    showToast(`端末DBを開けないため、この端末の保存領域を使用します。${String(error)}`)
  }
}

async function writeSubjectsToSQLite(items: Subject[]) {
  await CapacitorSQLite.executeSet({
    database: DB_NAME,
    set: [
      { statement: 'DELETE FROM subjects', values: [] },
      ...items.map((subject, index) => ({
        statement: 'INSERT OR REPLACE INTO subjects (name, color, sort_order) VALUES (?, ?, ?)',
        values: [subject.name, normalizeColor(subject.color), index],
      })),
    ],
    transaction: true,
  })
}

async function persistSubjects() {
  localStorage.setItem('tesma.subjects', JSON.stringify(subjects))
  if (!useLocalStorage && sqliteReady) await writeSubjectsToSQLite(subjects)
}

async function writeTasksToSQLite(items: Task[]) {
  await CapacitorSQLite.executeSet({
    database: DB_NAME,
    set: [
      { statement: 'DELETE FROM tasks', values: [] },
      ...items.map(task => ({ statement: 'INSERT OR REPLACE INTO tasks (id, data) VALUES (?, ?)', values: [task.id, JSON.stringify(task)] })),
    ],
    transaction: true,
  })
}

async function persistTasks() {
  // Keep a durable WebView-storage mirror as a recovery path if SQLite cannot open.
  localStorage.setItem('tesma.tasks', JSON.stringify(tasks))
  if (!useLocalStorage && sqliteReady) {
    try {
      await writeTasksToSQLite(tasks)
    } catch (error) {
      useLocalStorage = true
      showToast(`端末DBへの保存に失敗したため、端末保存領域に保存しました。${String(error)}`)
    }
  }
  try { await refreshNotifications() } catch (error) { console.error('通知予約に失敗しました', error) }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function dayDifference(date: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(`${date}T00:00:00`)
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

function renderTasks() {
  const visible = [...tasks]
    .filter(task => !completedOnly || task.status !== '完了')
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
  $('#task-count').textContent = `${visible.length} 件`
  const filterButton = $<HTMLButtonElement>('#completed-filter')
  filterButton.textContent = completedOnly ? 'すべて表示' : '未完了のみ'
  filterButton.setAttribute('aria-pressed', String(completedOnly))
  filterButton.classList.toggle('active', completedOnly)
  $('#task-list').innerHTML = visible.length ? visible.map(task => {
    const days = dayDifference(task.deadline)
    const when = days < 0 ? `${Math.abs(days)}日超過` : days === 0 ? '本日' : `あと ${days} 日`
    const subjectColor = normalizeColor(subjects.find(subject => subject.name === task.subject)?.color)
    return `<article class="task-card ${task.status === '完了' ? 'completed' : ''} ${task.type === 'テスト' ? 'test-card' : ''}" style="--subject-color:${subjectColor}">
      <div class="task-topline"><span class="type-pill">${task.type}</span><span class="due-pill ${days <= task.alertDays && task.status !== '完了' ? 'urgent' : ''}">${task.status === '完了' ? '完了済み' : when}</span></div>
      <h3>${escapeHtml(task.subject)}</h3><p class="task-content">${escapeHtml(task.content)}</p>
      <p class="task-date">${task.type === 'テスト' ? '実施日' : '期限'}：${escapeHtml(task.deadline.replaceAll('-', '/'))}</p>
      ${task.memo ? `<p class="task-meta">${escapeHtml(task.memo)}</p>` : ''}
      ${task.link ? `<a class="task-link" href="${escapeHtml(task.link)}" target="_blank" rel="noreferrer">関連リンクを開く ↗</a>` : ''}
      <div class="task-actions"><button data-action="edit" data-id="${task.id}" class="small-button">編集</button><button data-action="delete" data-id="${task.id}" class="small-button danger">削除</button><button data-action="toggle" data-id="${task.id}" class="small-button complete-button">${task.status === '完了' ? '未完了に戻す' : task.type === 'テスト' ? '対策完了' : '完了'}</button></div>
    </article>`
  }).join('') : `<div class="empty-state"><div class="empty-icon">✓</div><h3>${completedOnly ? '未完了のタスクはありません' : 'タスクはまだありません'}</h3><p>${completedOnly ? 'すべてのタスクが完了しています。' : '課題や小テストを登録すると、ここに表示されます。'}</p></div>`
}

function openForm(type: Task['type'], task?: Task) {
  currentType = type; editId = task?.id ?? null
  $('#form-title').textContent = task ? 'タスクを編集' : `${type}を追加`
  renderSubjectSelect(task?.subject)
  $<HTMLTextAreaElement>('#content').value = task?.content ?? ''
  $<HTMLInputElement>('#deadline').value = task?.deadline ?? new Date().toLocaleDateString('sv-SE')
  $<HTMLInputElement>('#deadline').min = new Date().toLocaleDateString('sv-SE')
  $<HTMLInputElement>('#alert-days').value = String(task?.alertDays ?? 3)
  $<HTMLInputElement>('#link').value = task?.link ?? ''
  $<HTMLInputElement>('#memo').value = task?.memo ?? ''
  $('#content-label').textContent = type === 'テスト' ? '範囲' : '内容'
  $('#date-label').textContent = type === 'テスト' ? '実施日' : '期限'
  $<HTMLDialogElement>('#task-dialog').showModal()
}

function renderSubjectSelect(selected = '') {
  const select = $<HTMLSelectElement>('#subject')
  const choices = [...subjects]
  if (selected && !choices.some(subject => subject.name === selected)) choices.push({ name: selected, color: DEFAULT_SUBJECT_COLOR })
  select.innerHTML = choices.map(subject => `<option value="${escapeHtml(subject.name)}">${escapeHtml(subject.name)}</option>`).join('')
  if (selected) select.value = selected
  else if (choices.length) select.selectedIndex = 0
}

function renderSubjectSettings() {
  $('#subject-settings-list').innerHTML = subjects.map((subject, index) => `
    <div class="subject-setting-row">
      <input class="subject-name" aria-label="教科名 ${index + 1}" value="${escapeHtml(subject.name)}" maxlength="60" placeholder="教科名">
      <input class="subject-color" aria-label="${escapeHtml(subject.name)}の色" type="color" value="${normalizeColor(subject.color)}">
      <button class="remove-subject" type="button" data-remove-subject="${index}" aria-label="${escapeHtml(subject.name)}を削除">削除</button>
    </div>`).join('')
}

function addSubjectSetting(name = '') {
  subjects = [...subjects, { name, color: DEFAULT_SUBJECT_COLOR }]
  renderSubjectSettings()
  const inputs = document.querySelectorAll<HTMLInputElement>('.subject-name')
  inputs[inputs.length - 1]?.focus()
}

function showToast(message: string) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible')
  window.setTimeout(() => toast.classList.remove('visible'), 2600)
}

async function refreshNotifications() {
  if (localMode) return
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) })
  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') return
  const notifications = tasks.filter(task => task.status !== '完了').flatMap(task => {
    const days = task.type === 'テスト' ? [...new Set([task.alertDays, 2, 1])] : [...new Set([task.alertDays, 1])]
    return days.filter(value => value > 0).map(value => {
      const due = new Date(`${task.deadline}T21:00:00`); due.setDate(due.getDate() - value)
      if (due.getTime() <= Date.now()) return null
      const id = notificationId(task.id, value)
      return { id, title: `${task.type}のリマインダー`, body: `${task.subject}：${task.content}（${value === 0 ? '本日' : `あと${value}日`}）`, schedule: { at: due }, extra: { taskId: task.id } }
    }).filter((item): item is NonNullable<typeof item> => item !== null)
  })
  if (notifications.length) await LocalNotifications.schedule({ notifications })
}

function notificationId(taskId: string, days: number) {
  let hash = days + 1
  for (const char of taskId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 2_000_000_000
}

$('#new-assignment').addEventListener('click', () => openForm('課題'))
$('#new-test').addEventListener('click', () => openForm('テスト'))
$('#settings').addEventListener('click', () => {
  renderSubjectSettings()
  $<HTMLDialogElement>('#settings-dialog').showModal()
})
$('#close-settings').addEventListener('click', () => $<HTMLDialogElement>('#settings-dialog').close())
$('#add-subject').addEventListener('click', () => addSubjectSetting())
$('#subject-settings-list').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-remove-subject]')
  if (!button) return
  subjects.splice(Number(button.dataset.removeSubject), 1)
  renderSubjectSettings()
})
$('#save-subjects').addEventListener('click', async () => {
  const rows = [...document.querySelectorAll<HTMLElement>('.subject-setting-row')]
  const updated = rows.map(row => ({
    name: row.querySelector<HTMLInputElement>('.subject-name')?.value.trim() ?? '',
    color: normalizeColor(row.querySelector<HTMLInputElement>('.subject-color')?.value),
  })).filter(subject => subject.name)
  const names = updated.map(subject => subject.name)
  if (new Set(names).size !== names.length) { showToast('教科名が重複しています'); return }
  if (updated.length === 0) { showToast('教科を1つ以上登録してください'); return }
  const previous = subjects
  subjects = updated
  try {
    await persistSubjects()
    renderSubjectSelect($<HTMLSelectElement>('#subject').value)
    renderTasks()
    $<HTMLDialogElement>('#settings-dialog').close()
    showToast('教科設定を保存しました')
  } catch (error) {
    subjects = previous
    showToast(`教科設定を保存できませんでした: ${String(error)}`)
  }
})
$('#completed-filter').addEventListener('click', () => { completedOnly = !completedOnly; renderTasks() })
$('#close-dialog').addEventListener('click', () => $<HTMLDialogElement>('#task-dialog').close())
$('#task-form').addEventListener('submit', async event => {
  event.preventDefault()
  const deadline = $<HTMLInputElement>('#deadline').value
  if (deadline < new Date().toLocaleDateString('sv-SE')) { showToast('過去の日付は登録できません'); return }
  const existing = editId ? tasks.find(task => task.id === editId) : undefined
  const task: Task = {
    id: existing?.id ?? crypto.randomUUID(), type: currentType, subject: $<HTMLInputElement>('#subject').value.trim(),
    content: $<HTMLTextAreaElement>('#content').value.trim(), deadline, alertDays: Number($<HTMLInputElement>('#alert-days').value), link: $<HTMLInputElement>('#link').value.trim(), memo: $<HTMLInputElement>('#memo').value.trim(),
    status: existing?.status ?? '未完了', createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  tasks = [task, ...tasks.filter(item => item.id !== task.id)]
  try {
    if (!localMode && (await LocalNotifications.checkPermissions()).display === 'prompt') await LocalNotifications.requestPermissions()
    await persistTasks()
    renderTasks(); $<HTMLDialogElement>('#task-dialog').close(); showToast('この端末に保存しました')
  } catch (error) { showToast(`保存に失敗しました: ${String(error)}`) }
})

$('#task-list').addEventListener('click', async event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
  if (!button) return
  const task = tasks.find(item => item.id === button.dataset.id)
  if (!task) return
  if (button.dataset.action === 'edit') { openForm(task.type, task); return }
  if (button.dataset.action === 'delete' && !confirm(`「${task.subject}」を削除しますか？`)) return
  if (button.dataset.action === 'delete') {
    tasks = tasks.filter(item => item.id !== task.id); await persistTasks(); showToast('削除しました')
  } else {
    task.status = task.status === '完了' ? '未完了' : '完了'; await persistTasks(); showToast(task.status === '完了' ? '完了にしました' : '未完了に戻しました')
  }
  renderTasks()
})

function createBackupJson() {
  return JSON.stringify({ format: 'tesma-backup-v1', exportedAt: new Date().toISOString(), tasks, subjects }, null, 2)
}

$('#backup').addEventListener('click', async () => {
  const filename = `tesma-backup-${new Date().toLocaleDateString('sv-SE')}.json`
  const json = createBackupJson()
  try {
    if (Capacitor.isNativePlatform()) {
      const file = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
      await Share.share({ title: 'TesMaバックアップ', text: '保存先（FilesやDriveなど）を選んでバックアップを保管してください。', files: [file.uri], dialogTitle: 'バックアップの保存先を選択' })
    } else {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
      URL.revokeObjectURL(url)
    }
    showToast('共有メニューから保存先を選んでください')
  } catch (error) {
    showToast(`バックアップを共有できませんでした: ${String(error)}`)
  }
})

$('#restore').addEventListener('click', () => $<HTMLInputElement>('#backup-file').click())
$<HTMLInputElement>('#backup-file').addEventListener('change', async event => {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const backup: unknown = JSON.parse(await file.text())
    if (!backup || typeof backup !== 'object' || !('format' in backup) || backup.format !== 'tesma-backup-v1' || !('tasks' in backup) || !Array.isArray(backup.tasks)) {
      throw new Error('TesMaのバックアップファイルではありません。')
    }
    if (!confirm('現在のタスクと教科設定をバックアップの内容に置き換えて復元しますか？')) return
    tasks = (backup.tasks as Task[]).map(task => ({ ...task }))
    if ('subjects' in backup && Array.isArray(backup.subjects)) {
      subjects = parseSubjects(JSON.stringify(backup.subjects))
      await persistSubjects()
    }
    await persistTasks()
    renderSubjectSelect()
    renderTasks()
    showToast(`${tasks.length}件のタスクを復元しました`)
  } catch (error) {
    showToast(`バックアップを読み込めませんでした: ${String(error)}`)
  } finally {
    input.value = ''
  }
})

void initializeDatabase().catch(error => showToast(`初期化に失敗しました: ${String(error)}`))
