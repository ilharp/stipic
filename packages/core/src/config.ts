import { Schema } from 'koishi'

export interface Config {
  env: string
  tgBotName: string
}

export const Config: Schema<Config> = Schema.object({
  env: Schema.string().required(),
  tgBotName: Schema.string().required(),
})
