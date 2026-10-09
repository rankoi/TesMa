export type Task = {
  id: string
  type: '課題' | 'テスト'
  subject: string
  content: string
  deadline: string
  alertDays: number
  link: string
  memo: string
  status: '未完了' | '完了'
  createdAt: string
}

export type Subject = {
  name: string
  color: string
}